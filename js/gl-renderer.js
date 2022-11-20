// Copyright 2021 James Deery
// Released under the MIT licence, https://opensource.org/licenses/MIT

import * as Shaders from '../build/shaders.js';
import { font } from '../build/font.js';

const MAX_RECTS = 1024;

const ARRAY_WIDTH = 33;
const ARRAY_HEIGHT = 23;

/* -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// TTS Class :: simple wrapper class for the native speech synthesis API
-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-  */
class TTS {
    _synth;
    _text;
    _last_type;
    _last_message;
    _startup_delay_lock;
    constructor() {
        this._synth = window.speechSynthesis;
        this._last_type = 'page';
        this._last_message = '';
        this._startup_delay_lock = true;
        let self = this;
        window.setTimeout( () => {
            self._startup_delay_lock = false;
        },750)
    }
    speak( text, type = '' ) {
        if( text ) text = text.toLowerCase();
        if( this._startup_delay_lock == true ) return;
        if( text === this._last_message ) return;
        if( !text || text === 'UNKNOWN PAGE' ) return;
        if( type != 'hint' ) this._last_message = text;

        this._text = new SpeechSynthesisUtterance();
        this._text.rate = 1.2;
        this._text.text = text;

        console.log(`speak[${this._last_type}?${type}:${this._synth.speaking}]: ${text}`);
        if( type == 'page' || this._last_type == 'hint' || (this._last_type == type && this._synth.speaking) )
            this._synth.cancel();

        this._last_type = type;
        this._synth.speak( this._text );
    }
}
const tts = new TTS();
window._TTS = tts;


/* -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
// Renderer Class :: screen rendering class
-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-  */
export class Renderer {
    _canvas;
    _gl;
    _bg = [0, 0, 0];
    _frameQueued = false;

    _onBackgroundChanged;

    _textArray = [];
    _lastArrayHash = '';

    _selectRect = {
        x: -1,
        y: -1,
        w: -1,
        h: -1,
        mode: ''
    };
    _lastRectHash = '';
    _lastRectText = '';

    _currentPage = '';
    _lastPage = '';
    _lastPageName = '';

    constructor(bg, onBackgroundChanged) {
        this._bg = [bg[0] / 255, bg[1] / 255, bg[2] / 255];
        this._onBackgroundChanged = onBackgroundChanged;

        this._canvas = document.getElementById('canvas')
        this._gl = this._canvas.getContext('webgl2', {
            alpha: false,
            antialias: false
        });

        const gl = this._gl;

        this._setupRects(gl);
        this._setupText(gl);
        this._setupWave(gl);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.viewport(0, 0, 320, 240);

        this._queueFrame();

        for(let i=0; i < ARRAY_HEIGHT; i++) {
            this._textArray.push( new Array( ARRAY_WIDTH ) );
            for( let j=0; j < ARRAY_WIDTH; j++ ) {
                this._textArray[i][j] = ' ';
            }
        }
        
        window._RENDER = this;

        let self = this;
        window.setTimeout( () => {
            tts.speak( this._currentPage + this._pageNumber( this._currentPage ), 'page' );
            tts.speak( this._labelFromSelection(), 'value' );
        },850);
    }

    /* -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // string _hashRect() -- return text hash of selection rectangle
       -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-  */
    _hashRect() {
        let r = this._selectRect;
        return `${r.x}-${r.y}-${r.w}-${r.h}-${r.mode}`;
    }

    /* -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // string _hashTextArray() -- return flattend text array
       -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-  */
    _hashTextArray() {
        let hash = '';
        for(let y=0; y < ARRAY_HEIGHT; y++) {
            for(let x=0; x < ARRAY_WIDTH; x++) {
                hash += this._textArray[y][x];
            }
        }
        return hash;
    }

    /* -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // string _pageFromArray() -- return text of page type
       -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-  */
    _pageFromArray() {
        let pageHeader = this._hashTextArray().substr( ARRAY_WIDTH * 2, 4 );
        let instHeader = this._hashTextArray().substr( ARRAY_WIDTH * 8, 4 );

        /*
            Pages with numbered headers:
                chain
                phrase
                groove
                scale
                inst
                table
        */

        if( pageHeader == 'LIVE' ) return 'LIVE';
        if( pageHeader == 'SONG' ) return 'SONG';
        if( pageHeader == 'CHOR' ) return 'EFFECTS';
        if( pageHeader == 'PROJ' ) return 'PROJECT';
        if( pageHeader == 'MIXE' ) return 'MIXER';

        if( pageHeader == 'CHAI' ) return 'CHAIN';
        if( pageHeader == 'PHRA' ) return 'PHRASE';
        if( pageHeader == 'TABL' ) return 'TABLE';
        if( pageHeader == 'GROO' ) return 'GROOVE';
        if( pageHeader == 'SCAL' ) return 'SCALE';

        if( pageHeader == 'INST' ) {
            return instHeader == 'ENV1' ? 'ENVELOPE' : 'INSTRUMENT';
        }

        if( this._textFromCoord(0, 0, 4) === 'EFFE' )
            return 'COMMAND SELECTOR'

        if( this._textFromCoord(8, 8, 8) === '1 2 3 4 ' )
            return 'KEYBOARD'

        if( this._textFromCoord(2, 5, 4) === 'SETT' )
            return 'MIDI SETTINGS';

        if( this._textFromCoord(2, 5, 4) === 'MAPP' )
            return 'MIDI MAPPING';

        if( this._textFromCoord(2, 0, 5) === 'THEME' )
            return 'THEME SETTINGS ... WARNING CHANGING THE FONT ... CURSOR COLOR ... OR SELECTION COLOR MAY BREAK TEXT TO SPEECH FUNCTIONALITY ... TEXT TO SPEECH IS DISABLED FOR THIS PAGE';

        if( this._textFromCoord(2,0,6) === 'RENDER' ) {
            return 'RENDER AUDIO';
        }

        // Overwrite warning pages
        // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
        if( this._textFromCoord(9, 2, 26) === 'LOSE CHANGES TO INSTRUMENT' )
            return 'LOSE CHANGES TO INSTRUMENT?';

        if( this._textFromCoord(9, 2, 28) === 'LOSE CHANGES TO CURRENT SONG' )
            return 'LOSE CHANGES TO CURRENT SONG?';

        if( this._textFromCoord(9, 2, 25) === 'OVERWRITE EXISTING SCALE?' )
            return 'OVERWRITE EXISTING SCALE?';

        if( this._textFromCoord(9, 2, 24) === 'OVERWRITE EXISTING SONG?' )
            return 'OVERWRITE EXISTING SONG?';

        if( this._textFromCoord(9, 2, 25) === 'OVERWRITE EXISTING INSTRU' )
            return 'OVERWRITE EXISTING INSTRUMENT?';

        if( this._textFromCoord(8, 2, 17) === 'CLEAR UNUSED PHRA' )
            return 'CLEAR UNUSED PHRASES AND CHAINS AND REMOVE DUPLICATES?';

        if( this._textFromCoord(8, 2, 17) === 'CLEAR UNUSED INST' )
            return 'CLEAR UNUSED INTRUMENTS AND TABLES AND REMOVE DUPLICATES?';

        if( this._textFromCoord(7, 2, 16) === 'CREATE DIRECTORY' )
            return 'CREATE DIRECTORY OF SONG AND SAMPLES? A PRE-EXISTING BUNDLE WILL BE OVERWRITTEN';

        // Load/Save dialog pages
        // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
        if( this._textFromCoord(2, 0, 9) === 'LOAD INST' )
            return 'LOAD INSTRUMENT';

        if( this._textFromCoord(2, 0, 9) === 'LOAD PROJ' )
            return 'LOAD PROJECT';

        if( this._textFromCoord(2, 0, 9) === 'LOAD SCAL' )
            return 'LOAD SCALE';

        if( this._textFromCoord(2, 0, 9) === 'SELECT SA' )
            return 'SELECT SAVE DIRECTORY';

        if( this._textFromCoord(2, 0, 9) === 'CREATE DI' )
            return 'CREATE DIRECTORY';

        // Application home screen
        // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
        if( this._hashTextArray().replace(/\s/g,'') === '' )
            return 'M8 WEB FLOW ... APPLICATION HOME SCREEN ... PLEASE CONNECT A DIRTY WAVE M8 DEVICE TO CONTINUE'

        // Error unkown page type
        // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
        return 'UNKNOWN PAGE';
    }

    /* -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // string _pageNumber() -- return page number for numbered pages
       -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-  */
    _pageNumber( page ) {
        if( page == 'CHAIN' || page == 'TABLE' )
            return ' ' + this._textFromCoord(2,6,2);

        if( page == 'PHRASE' || page == 'GROOVE' ) 
            return ' ' + this._textFromCoord(2,7,2);

        if( page == 'ENVELOPE' || page == 'INSTRUMENT' ) {
            let label = ' ' + this._textFromCoord(2,6,2);
                label += ' ... ' + this._textFromCoord(5,8,12);
            return label;
        }

        if( page == 'SCALE' ) {
            let label = ' ' + this._textFromCoord(2,6,2);
                label += ' ... ' + this._textFromCoord(20,6,16);
            return label;
        }

        if( page == 'CREATE DIRECTORY' ) {
            let path = this._textFromCoord(4,5,25).replace(/\//g,' forward slash ').replace(/\./g,' dot ');
            return ' path ' + path;
        }
        return '';
    }

    /* -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // {row,col,len} _coordFromRect() -- return text array co-ordinates of selection box
       -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-  */
    _coordFromRect() {
        let row = Math.floor( this._selectRect.y / 10) - 1;
        let col = Math.floor( this._selectRect.x / 8 );
        let len = Math.floor( this._selectRect.w / 8 );
        return {row,col,len};
    }

    /* -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // string _textFromSelection() -- return text value of selection box
       -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-  */
    _textFromSelection() {
        let rect = this._coordFromRect();
        //console.log(`_textFromSelection: ${rect.row} ${rect.col} ${rect.len}`);
        return this._textFromCoord( rect.row, rect.col, rect.len );
    }

    /* -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // string _textFromCoord( row, col, len ) -- return text value at given co-ordinates
       -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-  */
    _textFromCoord( row, col, len ) {
        return this._hashTextArray().substr( ARRAY_WIDTH * row + col, len );
    }

    _instrumentTypeText() {
        if( this._currentPage == 'INSTRUMENT' )
            return this._textFromCoord(4, 8, 8);
        else
            return '';
    }

    /* -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // char _expandPunctuation( char ) -- return expanded name of punctuation characters
    -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-  */
    _expandPunctuation( char ) {
        switch( char ) {
            case '/': char = 'forward slash'; break;
            case '.': char = 'dot'; break;
            case ' ': char = 'space'; break;
            case '-': char = 'minus sign'; break;
            case '_': char = 'underscore'; break;
            case '+': char = 'plus sign'; break;
            case '=': char = 'equals sign'; break;
            case '!': char = 'exclamation'; break;
            case '@': char = 'at symbol'; break;
            case '#': char = 'hash mark'; break;
            case '$': char = 'dollar sign'; break;
            case '%': char = 'percent'; break;
            case '^': char = 'charet'; break;
            case '&': char = 'ampersand'; break;
            case '(': char = 'open parenthesis'; break;
            case ')': char = 'close parenthesis'; break;
        }
        return char;
    }

    /* -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-
    // string _labelFromSelection() -- return text description of selected value
       -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-  */
    _labelFromSelection() {        
        let coord = this._coordFromRect();
        let val = this._textFromSelection();


        // DIALOGS
        //----------------------------------------------------------------------------------------
        if( 
            this._currentPage == 'LOSE CHANGES TO INSTRUMENT?' ||
            this._currentPage == 'LOSE CHANGES TO CURRENT SONG?' ||
            this._currentPage == 'OVERWRITE EXISTING SCALE?' ||
            this._currentPage == 'OVERWRITE EXISTING SONG?' ||
            this._currentPage == 'OVERWRITE EXISTING INSTRUMENT?' ||
            this._currentPage == 'CLEAR UNUSED PHRASES AND CHAINS AND REMOVE DUPLICATES?' ||
            this._currentPage == 'CLEAR UNUSED INTRUMENTS AND TABLES AND REMOVE DUPLICATES?' ||
            this._currentPage == 'CREATE DIRECTORY OF SONG AND SAMPLES? A PRE-EXISTING BUNDLE WILL BE OVERWRITTEN'
        ) return `${val}`;

        if( 
            this._currentPage == 'SELECT SAVE DIRECTORY' || 
            this._currentPage == 'LOAD INSTRUMENT' ||
            this._currentPage == 'LOAD PROJECT' ||
            this._currentPage == 'LOAD SCALE'
        ) {
            val = val.substring(0, val.length - 5 );
            val = val.replace(/\./g, ' dot ');
            val = val.replace(/\//g, ' forward slash ');
            return `${val}`;
        }

        if( this._currentPage == 'CREATE DIRECTORY' ) {
            if( coord.row == 5 ) {
                val = this._textFromCoord( coord.row, 5, 25 );
                let char = this._textFromSelection();
                if( char != '-') char = this._expandPunctuation( char);
                char = char == '-' ? 'empty' : `letter ${char}`
                return `name ${val} ${char} ... position ${coord.col - 4}`;
            }
            return val;
        }

        // KEYBOARD PAGE
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'KEYBOARD' ) {
            val = this._expandPunctuation( val );
            return `${val}`;
        }

        // SONG/LIVE PAGE
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'SONG' || this._currentPage == 'LIVE' ) {
            let row = this._textFromCoord( coord.row, 0, 2);    
            let col = Math.floor( (coord.col - 3) / 3) + 1;
            if( val === '--') val = 'empty';

            return `${val} ... row ${row} track ${col}`;
        }

        // CHAIN PAGE
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'CHAIN' ) {
            let row = this._textFromCoord( coord.row, 0, 2);
            
            let col = Math.floor( (coord.col - 3) / 3);
                col = col ? "phrase" : "transpose"

            if( val === '--') val = 'empty';

            return `${val} ... row ${row} ${col}`;
        }

        // PHRASE PAGE
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'PHRASE' ) {
            let row = this._textFromCoord( coord.row, 0, 2);
            
            let col_i = Math.floor( (coord.col - 2) / 3);
            let col_text = 'error';
            switch( col_i ) {
                case 0: col_text = "note"; break;
                case 1: col_text = "velocity"; break;
                case 2: col_text = "instrument"; break;
                case 3: col_text = "effects 1 type"; break;
                case 4: col_text = "effects 1 value"; break;
                case 5: col_text = "effects 2 type"; break;
                case 6: col_text = "effects 2 value"; break;
                case 7: col_text = "effects 3 type"; break;
                case 8: col_text = "effects 3 value"; break;
            }

            if( val.substring(0,1) === '-') {
                val = 'empty';
            } else if( col_i == 3 || col_i == 5 ||col_i == 7 ) {
                val = val.split('').join(' ');
            }

            return `${val} ... row ${row} ${col_text}`;
        }

        // TABLE PAGE
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'TABLE' ) {
            let row = this._textFromCoord( coord.row, 0, 2);
            
            let col = Math.floor( (coord.col - 2) / 3);
            switch( col ) {
                case 0: col = "transpose"; break;
                case 1: col = "volume"; break;
                case 2: col = "effects 1 type"; break;
                case 3: col = "effects 1 value"; break;
                case 4: col = "effects 2 type"; break;
                case 5: col = "effects 2 value"; break;
                case 6: col = "effects 3 type"; break;
                case 7: col = "effects 3 value"; break;
            }

            if( val.substring(0,1) === '-') val = 'empty';

            return `${val} ... row ${row} for ${col}`;
        }
        
        // GROOVE PAGE
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'GROOVE' ) {
            let row = this._textFromCoord( coord.row, 0, 2);
            if( val.substring(0,1) === '-') val = 'empty';

            return `${val} row ${row} ticks`;
        }

        // PROJECT PAGE
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'PROJECT' ) {
            let label = 'error';
            switch( coord.row ) {
                case 4: label = 'transpose'; break;
                
                case 5: label = 'tempo'; 
                    val = this._textFromCoord( coord.row, 14, 6 );
                    if( coord.col != 14 ) {
                        val += ' '; // force respeak on tempo fraction
                        label += ' fine tuning';
                    }
                    break;

                case 6: label = 'output volume'; break;
                case 7: label = 'speaker volume'; break;
                case 8: label = 'note preview'; break;
                case 9: label = 'live quantize'; break;

                case 11: label = 'open'; break;
                case 12: label = 'open'; break;

                case 14: label = 'name'; 
                    val = this._textFromCoord( coord.row, 14, 12 );
                    let char = this._textFromSelection();
                    if( char != '-') char = this._expandPunctuation( char);
                    char = char == '-' ? 'empty' : `letter ${char}`
                    return `name ${val} ${char} ... position ${coord.col - 13}`;
                    break;

                case 15: label = 'file'; break;
                case 16: label = 'export'; break;

                case 18: label = 'compact'; break;
                case 19: label = 'compact'; break;

                case 21: label = ''; break;
            }
            return `${val} ... ${label}`;
        }

        // INSTRUMENT PAGE
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'INSTRUMENT' ) {
            let label = 'error';
            let type = this._instrumentTypeText();

            switch( coord.row ) {
                case 4: label = ( coord.col == 8 ) ? 'type' : 'instrument'; break;
                
                case 5: label = 'name'; 
                    val = this._textFromCoord( coord.row, 8, 12 );
                    let char = this._textFromSelection();
                    if( char != '-') char = this._expandPunctuation( char);
                    char = char == '-' ? 'empty' : `letter ${char}`
                    return `name ${val} ... ${char} ... position ${coord.col - 7}`;
                    break;

                case 6: label = ( coord.col == 8 ) ? 'transpose' : 'table tick'; break;
            }

            // WAVSYNTH TYPE
            //------------------------------------------------------------------------------------
            if( type === 'WAVSYNTH' ) {
                switch( coord.row ) {
                    case 8: 
                        label = 'shape'; 
                        val = this._textFromCoord( coord.row, 8, 20 ); 
                        val = val.substring(0, 2) + ' ' + val.substring(2);
                        break;
                    
                    case 10: label = ( coord.col == 8 ) ? 'size' : 'amp'; break;
                    
                    case 11: if( coord.col == 8 ) {
                            label = 'multiplier';
                        } else {
                            label = 'limiter';
                            val = this._textFromCoord( coord.row, 22, 9 ); break;
                        } break;

                    case 12: label = ( coord.col == 8 ) ? 'warp' : 'panning'; break;
                    case 13: label = ( coord.col == 8 ) ? 'mirror' : 'dry'; break;

                    case 14: if( coord.col == 8 ) {
                        label = 'filter';
                        val = this._textFromCoord( coord.row, 8, 9 ); break;                    
                    } else {
                        label = 'chorus';
                    } break;
                    case 15: label = ( coord.col == 8 ) ? 'cutoff' : 'delay'; break;
                    case 16: label = ( coord.col == 8 ) ? 'resonance' : 'reverb'; break;
                }
            }

            // MACROSYN TYPE
            //------------------------------------------------------------------------------------
            if( type === 'MACROSYN' ) {
                switch( coord.row ) {
                    case 8: label = 'shape';
                        val = this._textFromCoord( 8, 8, 20 ); 
                        val = val.substring(0, 2) + ' ' + val.substring(2);
                        break;
                    
                    case 10: label = ( coord.col == 8 ) ? 'timbre' : 'amp'; break;
                    
                    case 11: if( coord.col == 8 ) {
                            label = 'color';
                        } else {
                            label = 'limiter';
                            val = this._textFromCoord( coord.row, 22, 9 ); break;
                        } break;

                    case 12: label = ( coord.col == 8 ) ? 'degrade' : 'panning'; break;
                    case 13: label = ( coord.col == 8 ) ? 'redux' : 'dry'; break;

                    case 14: if( coord.col == 8 ) {
                        label = 'filter';
                        val = this._textFromCoord( coord.row, 8, 9 ); break;                    
                    } else {
                        label = 'chorus';
                    } break;
                    case 15: label = ( coord.col == 8 ) ? 'cutoff' : 'delay'; break;
                    case 16: label = ( coord.col == 8 ) ? 'resonance' : 'reverb'; break;
                }
            }
            
            // SAMPLER TYPE
            //------------------------------------------------------------------------------------
            if( type === 'SAMPLER ' ) {
                switch( coord.row ) {
                    case 8: label = 'sample'; break;
                    
                    case 10: if( coord.col == 8 ) {
                        label = 'slice';
                        val = this._textFromCoord( coord.row, 8, 9 );
                    } else {
                        label = 'amp';
                    } break;
                    
                    case 11: if( coord.col == 8 ) {
                            label = 'play';
                            val = this._textFromCoord( coord.row, 8, 9 );
                        } else {
                            label = 'limiter';
                            val = this._textFromCoord( coord.row, 22, 9 );
                        } break;

                    case 12: label = ( coord.col == 8 ) ? 'start' : 'panning'; break;
                    case 13: label = ( coord.col == 8 ) ? 'loop start' : 'dry'; break;
                    case 14: label = ( coord.col == 8 ) ? 'length' : 'chorus'; break;
                    case 15: label = ( coord.col == 8 ) ? 'detune' : 'delay'; break;
                    case 16: label = ( coord.col == 8 ) ? 'degrade' : 'reverb'; break;

                    case 17: label = 'filter'; val = this._textFromCoord( coord.row, 8, 9 ); break;
                    case 18: label = ( coord.col == 8 ) ? 'cutoff' : 'delay'; break;
                    case 19: label = ( coord.col == 8 ) ? 'resonance' : 'reverb'; break;
                }
            }
            
            // FMSYNTH TYPE
            //------------------------------------------------------------------------------------
            if( type === 'FMSYNTH ' ) {
                switch( coord.row ) {
                    case 8: label = 'algo'; 
                        val = this._textFromCoord( coord.row, 8, 24 );
                        val = val.replace(/\s+$/,'');
                        val = val.replace(/ /g,' to ');
                        val = val.replace(/\+/g,' plus ');
                        val = val.substring(0, 2) + ' ... ' + val.substring(2);
                        break;

                    case 9: switch( coord.col ) {
                        case 10: label = 'oscillator type A'; break;
                        case 16: label = 'oscillator type B'; break;
                        case 22: label = 'oscillator type C'; break;
                        case 28: label = 'oscillator type D'; break;
                    } break;

                    case 10: label = 'ratio ' + ((coord.col%2) ? ' ' : '') + 'oscillator ';
                        switch( coord.col ) {
                            case 8:  case 11: val = this._textFromCoord( coord.row, 8,  5 ); label += 'a'; break;
                            case 14: case 17: val = this._textFromCoord( coord.row, 14, 5 ); label += 'b'; break;
                            case 20: case 23: val = this._textFromCoord( coord.row, 20, 5 ); label += 'c'; break;
                            case 26: case 29: val = this._textFromCoord( coord.row, 26, 5 ); label += 'd'; break;
                        }
                        if( coord.col % 2 ) label += ' ... fine tuning';
                    break;
                    
                    case 11: 
                        switch( coord.col ) {
                            case 8:  label = 'level oscillator A'; break;
                            case 14: label = 'level oscillator B'; break;
                            case 20: label = 'level oscillator C'; break;
                            case 26: label = 'level oscillator D'; break;
                            case 11: label = 'feedback oscillator A'; break;
                            case 17: label = 'feedback oscillator B'; break;
                            case 23: label = 'feedback oscillator C'; break;
                            case 29: label = 'feedback oscillator D'; break;
                        }
                    break;

                    case 12: 
                    case 13: 
                        label = 'modulator '
                        switch( coord.col ) {
                            case 8:  val = this._textFromCoord( coord.row, 8,  5 ); label += 'a'; break;
                            case 14: val = this._textFromCoord( coord.row, 14, 5 ); label += 'b'; break;
                            case 20: val = this._textFromCoord( coord.row, 20, 5 ); label += 'c'; break;
                            case 26: val = this._textFromCoord( coord.row, 26, 5 ); label += 'd'; break;
                        }
                        if( val.substring(0,1) === '-' ) val = 'empty';
                        if( coord.row == 13 ) {
                            val += ' ';
                            label += ' 2'
                        } else {
                            label += ' 1'
                        }

                    break;


                    case 14: label = ( coord.col == 8 ) ? 'modulator 1' : 'amp'; break;
                    case 15: if( coord.col == 8 ) {
                        label = 'modulator 2';
                    } else {
                        label = 'limiter';
                        val = this._textFromCoord( coord.row, 22, 9 ); break;
                    } break;
                    case 16: label = ( coord.col == 8 ) ? 'modulator 3' : 'panning'; break;
                    case 17: label = ( coord.col == 8 ) ? 'modulator 4' : 'dry'; break;
                    case 18: if( coord.col == 8 ) {
                        label = 'filter'; 
                        val = this._textFromCoord( coord.row, 8, 9 );
                    } else {
                        label = 'chorus';
                    } break;
                    case 19: label = ( coord.col == 8 ) ? 'cutoff' : 'delay'; break;
                    case 20: label = ( coord.col == 8 ) ? 'resonance' : 'reverb'; break;
                }
            }

            // MIDI OUT TYPE
            //------------------------------------------------------------------------------------
            if( type === 'MIDI OUT' ) {
                if( val[0] === '-' ) val = 'empty';
                if( coord.row == 8 ) {
                    label = 'port';
                    val = this._textFromCoord(coord.row, 12, 10);
                    val = val.substring(0,2) + ' ... ' + val.substring(2);
                }
                if( coord.row == 9 ) label = 'midi channel';
                if( coord.row == 10 ) {
                    if( coord.col == 12 ) {
                        label = 'bank';
                        val.substring( 0, val.length - 1 );
                    } else {
                        label = 'program change';
                    }
                }
                if( coord.row >= 11 && coord.row <= 20 ) {
                    if( coord.col == 12 ) {
                        label = 'number';
                        val.substring( 0, val.length - 1 );
                    } else {
                        label = 'value';
                    }
                    label += ' for cc .. ' + String.fromCharCode( 65 + coord.row - 11 );
                }
            }

            return `${val} ... ${label}`;
        }

        // ENVELOPE PAGE
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'ENVELOPE' ) {
            let label = 'error';
            switch(  coord.row ) {
                case 4: label = ( coord.col == 8 ) ? 'type' : 'instrument'; break;

                case 5: label = 'name'; 
                    val = this._textFromCoord( 5, 8, 12 );
                    let char = this._textFromSelection();
                    if( char != '-') char = this._expandPunctuation( char);
                    char = char == '-' ? 'empty' : `letter ${char}`
                    return `name ${val} ${char} ... position ${coord.col - 7}`;
                    break;

                case 6: label = ( coord.col == 8 ) ? 'transpose' : 'table tick'; break;
                
                case 8: if( coord.col == 8 ) {
                        label = 'envelope 1';
                        val = this._textFromCoord( 8, 8, 9 ); 
                        val = val.substring(0,2) + ' ' + val.substring(2);
                        break;
                    } else {
                        label = 'L F O';
                        val = this._textFromCoord( 8, 22, 9 ); 
                        val = val.substring(0,2) + ' ' + val.substring(2);
                        break;
                    } break;
                case 14: if( coord.col == 8 ) {
                        label = 'envelope 2';
                        val = this._textFromCoord( 14, 8, 9 ); 
                        val = val.substring(0,2) + ' ' + val.substring(2);
                        break;
                    } else {
                        label = 'L F O';
                        val = this._textFromCoord( 14, 22, 9 ); 
                        val = val.substring(0,2) + ' ' + val.substring(2);
                        break;
                    } break;

                case 15:    
                case 9: label = ( coord.col == 8 ) ? 'amount' : 'L F O amount'; break;

                case 16:
                case 10: if( coord.col == 8 ) {
                        label = 'attack';
                    } else {
                        label = 'oscillator';
                        val = this._textFromCoord( coord.row, 22, 9 ); 
                        val = val.substring(0,2) + ' ' + val.substring(2);
                        break;
                    } break;
                
                case 17:
                case 11: if( coord.col == 8 ) {
                        label = 'hold';
                    } else {
                        label = 'trigger';
                        val = this._textFromCoord( coord.row, 22, 9 ); 
                        val = val.substring(0,2) + ' ' + val.substring(2);
                        break;
                    } break;

                case 18:    
                case 12: label = ( coord.col == 8 ) ? 'decay' : 'frequency'; break;
            }
            return `${val} ... ${label}`;
        }

        // MIXER PAGE
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'MIXER' ) {
            let label = 'error';
            let mono = this._textFromCoord( 17, 18, 2) == '--' ? '' : 'left';
            switch( coord.row ) {
                case 4: label = ( coord.col == 13 ) ? 'volume' : 'limiter'; break;
                case 5: label = ( coord.col == 13 ) ? 'D J filter' : 'peak'; break;

                case 11: label = `track ${Math.floor( coord.col /3 ) + 1}`; break;
                case 17: switch( coord.col ) {
                    case 0: label = 'chorus level'; break;
                    case 4: label = 'delay level'; break;
                    case 8: label = 'reverb level'; break;
                    case 15: label = `input ${mono} level`; break;

                    case 18: 
                        if( val === '--') {
                            label = ''; 
                            val = 'stereo input mode';
                        } else {
                            label = 'input right level'; 
                        }
                    break;

                    case 21: label = 'usb level'; break;
                } break;
                case 18: switch( coord.col ) {
                    case 15: label = `input chorus ${mono} level`; break;
                    case 18: label = 'input chorus right level'; break;
                    case 21: label = 'usb chorus level'; break;
                } break;
                case 19: switch( coord.col ) {
                    case 15: label = `input delay ${mono} level`; break;
                    case 18: label = 'input delay right level'; break;
                    case 21: label = 'usb delay level'; break;
                } break;
                case 20: switch( coord.col ) {
                    case 15: label = `input reverb ${mono} level`; break;
                    case 18: label = 'input reverb right level'; break;
                    case 21: label = 'usb reverb level'; break;
                } break;         
            }
            return `${val} ... ${label}`;
        }

        
        // EFFECTS PAGE
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'EFFECTS' ) {
            let label = 'error';
            switch( coord.row ) {
                case 3: label = "chorus depth"; break;
                case 4: label = "chorus frequency"; break;
                case 5: label = "chorus width"; break;
                case 6: label = "chorus reverb send"; break;

                case 9: label = ( coord.col == 14 ) ? 'delay hi-pass' : 'delay lo-pass'; break;
                case 10: label = ( coord.col == 14 ) ? 'delay time left' : 'delay time right'; break;
                case 11: label = "delay feedback"; break;
                case 12: label = "delay width"; break;
                case 13: label = "delay reverb send"; break;

                case 16: label = ( coord.col == 14 ) ? 'reverb hi-pass' : 'reverb lo-pass'; break;
                case 17: label = "reverb size"; break;
                case 18: label = "reverb decay"; break;
                case 19: label = "reverb depth"; break;
                case 20: label = "reverb frequency"; break;
                case 21: label = "reverb width"; break;
            }
            return `${val} ... ${label}`;
        }

        // MIDI MAPPING PAGE
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'MIDI MAPPING' ) {
            let row = this._textFromCoord( coord.row, 0, 2);
            let col_text = 'error';
            switch( coord.col ) {
                case 3: col_text = "channel"; break;
                case 6: col_text = "control"; break;
                case 10: col_text = "last value"; break;
                case 13: col_text = "range minimum"; break;
                case 16: col_text = "range maximum"; break;
                case 19: 
                    col_text = "destination"; 
                    val = this._textFromCoord( coord.row, 19, 12 );
                    break;
            }

            if( val.substring(0,1) === '-') val = 'empty';

            return `${val} ... row ${row} ... ${col_text}`;
        }

        // MIDI SETTINGS PAGE
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'MIDI SETTINGS' ) {
            let label = 'error';
            let col = Math.floor( (coord.col - 6) / 3) + 1;
            switch( coord.row ) {
                case 4: label = "receive sync"; break;
                case 5: label = "receive transport"; break;
                case 6: label = "send sync"; break;
                case 7: label = "send transport"; break;
                case 8: label = "record note channel"; break;
                case 9: label = "record velocity"; break;
                case 10: label = "record delay"; break;
                case 11: label = "control map channel"; break;
                case 12: label = "song row cue channel"; break;

                case 16: label = `input channel ${col}`; break;
                case 17: label = `input instrument ${col}`; break;
                case 18: label = (coord.col == 10) ? 'program change' : 'note mode'; break;
                case 20: label = ''; break;
            }
            return `${val} ... ${label}`;
        }

        // SCALE SETTINGS PAGE
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'SCALE' ) {
            let label = 'error';
            if( coord.row == 4 ) return `${val} ... key`;
            if( coord.row >= 7 && coord.row <= 18 ) {
                let row = this._textFromCoord( coord.row, 0, 2);
                switch( coord.col ) {
                    case 3: label = 'enabled'; break;
                    case 6:
                    case 9: label = 'offset';
                        val = this._textFromCoord( coord.row, 6, 5 );
                        if( coord.col == 9 ) {
                            val += ' ';
                            label += ' fine tuning';
                        } break;
                }
                row = row.replace('#',' sharp');
                return `${val} ... note ${row} ... ${label}`;
            }
            if( coord.row == 20 ) {
                val = this._textFromCoord( coord.row, 6, 16 );
                let char = this._textFromSelection();
                if( char != '-') char = this._expandPunctuation( char);
                char = char == '-' ? 'empty' : `letter ${char}`
                return `name ${val} ${char} ... position ${coord.col - 5}`;
            }
            if( coord.row == 21 ) return val;
            return `${val} ... ${label}`;
        }

        // COMMAND SELECTOR
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'COMMAND SELECTOR' ) {
            let label = '';
            let help = this._textFromCoord(2, 0, ARRAY_WIDTH * 4).replace(/\s{2,}/g,' ... ');
            let name = help.split(':')[0];
            val = val.split('').join(' ');
            if( coord.row >= 7 && coord.row <= 9 ) {
                label = 'sequencer command';
            }
            if( coord.row >= 12 && coord.row <= 15 ) {
                label = 'mixer effects command';
            }
            if( coord.row >= 18 && coord.row <= 21 ) {
                label = 'current instrument';
            }
            return `${val} ... ${name} ${label} ... ${help}`;
        }

        // RENDER AUDIO
        //----------------------------------------------------------------------------------------
        if( this._currentPage == 'RENDER AUDIO' ) {
            let label = 'error';
            switch( coord.row ) {
                case 4: label = 'song row start'; break;
                case 5: 
                    label = 'song row last';
                    if( this._textFromCoord(coord.row, 18, 4) == 'AUTO')
                        val = 'AUTO';
                    break;
                case 6:
                    label = 'song repeat';
                    if( this._textFromCoord(coord.row, 18, 3) == 'OFF')
                        val = 'OFF';
                    break;
                case 9:
                    let track = Math.floor( (coord.col - 8) / 3 ) + 1;
                    label = `track ${track}`
                    if( val === '--' ) val = 'OFF';
                    break;
                case 10: label = 'chorus'; break;
                case 11: label = 'delay'; break;
                case 12: label = 'reverb'; break;
                case 13: label = 'limiter'; break;
                case 16: label = 'name'; 
                    val = this._textFromCoord( coord.row, 8, 12 );
                    let char = this._textFromSelection();
                    if( char != '-') char = this._expandPunctuation( char);
                    char = char == '-' ? 'empty' : `letter ${char}`
                    return `name ${val} ${char} ... position ${coord.col - 7}`;
                    break;
                case 17: label = 'render'; break;
            }
            return `${val} ... ${label}`;
        }
    }

    _rectShader;
    _rectVao;
    _rectShapes = new Uint16Array(MAX_RECTS * 6);
    _rectColours = new Uint8Array(this._rectShapes.buffer, 8);
    _rectCount = 0;
    _rectsClear = true;
    _rectsTex;
    _rectsFramebuffer;
    _blitShader;

    _setupRects(gl) {
        this._rectShader = buildProgram(gl, 'rect');

        this._rectVao = gl.createVertexArray();
        gl.bindVertexArray(this._rectVao);

        this._rectShapes.glBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._rectShapes.glBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._rectShapes, gl.STREAM_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 4, gl.UNSIGNED_SHORT, false, 12, 0);
        gl.vertexAttribDivisor(0, 1);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.UNSIGNED_BYTE, true, 12, 8);
        gl.vertexAttribDivisor(1, 1);

        this._rectsTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._rectsTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 320, 240, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        this._rectsFramebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this._rectsFramebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._rectsTex, 0);

        this._blitShader = buildProgram(gl, 'blit');
        gl.useProgram(this._blitShader);
        gl.uniform1i(gl.getUniformLocation(this._blitShader, 'src'), 0);
    }

    _renderRects(gl) {
        if (this._rectsClear) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._rectsFramebuffer);

            gl.clearColor(this._bg[0], this._bg[1], this._bg[2], 1);
            gl.clear(gl.COLOR_BUFFER_BIT);
            this._rectsClear = false;
        }

        if (this._rectCount > 0) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this._rectsFramebuffer);

            gl.useProgram(this._rectShader);
            gl.bindVertexArray(this._rectVao);

            gl.bindBuffer(gl.ARRAY_BUFFER, this._rectShapes.glBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._rectShapes.subarray(0, this._rectCount * 6));

            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this._rectCount);

            this._rectCount = 0;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.useProgram(this._blitShader);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    drawRect(x, y, w, h, r, g, b) {
        if (x === 0 && y === 0 && w === 320 && h === 240) {
            this._onBackgroundChanged(r, g, b);

            this._bg = [r / 255, g / 255, b / 255];
            this._rectCount = 0;
            this._rectsClear = true;

        } else if (this._rectCount < MAX_RECTS) {
            const i = this._rectCount;
            this._rectShapes[i * 6 + 0] = x;
            this._rectShapes[i * 6 + 1] = y;
            this._rectShapes[i * 6 + 2] = w;
            this._rectShapes[i * 6 + 3] = h;
            this._rectColours[i * 12 + 0] = r;
            this._rectColours[i * 12 + 1] = g;
            this._rectColours[i * 12 + 2] = b;
            this._rectCount++;

            if( r + g + b > 0) {
                if( w >= 8 && h >= 10 ) {
                    let mode = g > 0 ? 'value' : 'copy';
                    this._selectRect = { x, y, w, h, mode };
                    console.log(`drawRect( ${x}, ${y}, ${w}, ${h}, ${r}, ${g}, ${b}, ${mode})`)
                }
            }
        }

        if (this._rectCount >= MAX_RECTS) {
            this._renderRects(this._gl);
        }

        this._queueFrame();
    }

    _textShader;
    _textVao;
    _textTex;
    _textColours = new Uint8Array(40 * 24 * 3);
    _textChars = new Uint8Array(40 * 24);

    _setupText(gl) {
        this._textShader = buildProgram(gl, 'text');
        gl.useProgram(this._textShader);
        gl.uniform1i(gl.getUniformLocation(this._textShader, 'font'), 1);

        this._textVao = gl.createVertexArray();
        gl.bindVertexArray(this._textVao);

        this._textColours.glBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._textColours.glBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._textColours, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.UNSIGNED_BYTE, true, 0, 0);
        gl.vertexAttribDivisor(0, 1);

        this._textChars.glBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._textChars.glBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._textChars, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 1, gl.UNSIGNED_BYTE, false, 0, 0);
        gl.vertexAttribDivisor(1, 1);

        this._textTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this._textTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 470, 7, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        const fontImage = new Image();
        fontImage.onload = () => {
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this._textTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 470, 7, 0, gl.RGBA, gl.UNSIGNED_BYTE, fontImage);
            this._queueFrame();
        }
        fontImage.src = font;
    }

    _renderText(gl) {
        gl.useProgram(this._textShader);
        gl.bindVertexArray(this._textVao);

        if (this._textColours.updated) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._textColours.glBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._textColours);
            this._textColours.updated = false;
        }

        if (this._textChars.updated) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this._textChars.glBuffer);
            gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._textChars);
            this._textChars.updated = false;
        }

        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, 40 * 24);
    }

    drawText(c, x, y, r, g, b) {
        const i = Math.floor(y / 10) * 40 + Math.floor(x / 8);
        this._textChars[i] = c - 32;
        this._textChars.updated = true;
        this._textColours[i * 3 + 0] = r;
        this._textColours[i * 3 + 1] = g;
        this._textColours[i * 3 + 2] = b;
        this._textColours.updated = true;

        let arrY = Math.floor(y/10) -1;
        let arrX = Math.floor(x/8) -1;
        let charS = String.fromCharCode(c);
        
        if( arrX < ARRAY_WIDTH )
            this._textArray[arrY][arrX] = (charS == '>' ? ' ' : charS);

        //console.log(`drawText: ${i-41} [${arrY} ${arrX}] ${c} ${charS} ${r},${b},${g}`);

        this._queueFrame();
    }
        
    _waveData = new Uint8Array(320);
    _waveColour = new Float32Array([0.5, 1, 1]);
    _waveOn = false;

    _setupWave(gl) {
        this._waveShader = buildProgram(gl, 'wave');
        this._waveShader.colourUniform = gl.getUniformLocation(this._waveShader, 'colour');
        this._waveVao = gl.createVertexArray();
        gl.bindVertexArray(this._waveVao);

        this._waveData.glBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this._waveData.glBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._waveData, gl.STREAM_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribIPointer(0, 1, gl.UNSIGNED_BYTE, 1, 0);
    }

    _renderWave(gl) {
        if (this._waveOn) {
            gl.useProgram(this._waveShader);
            gl.uniform3fv(this._waveShader.colourUniform, this._waveColour);
            gl.bindVertexArray(this._waveVao);

            if (this._waveData.updated) {
                gl.bindBuffer(gl.ARRAY_BUFFER, this._waveData.glBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, this._waveData);
                this._waveData.updated = false;
            }

            gl.drawArrays(gl.POINTS, 0, 320);
        }
    }

    drawWave(r, g, b, data) {
        this._waveColour[0] = r / 255;
        this._waveColour[1] = g / 255;
        this._waveColour[2] = b / 255;

        if (data.length == 320) {
            this._waveData.set(data);
            this._waveData.updated = true;
            this._waveOn = true;
            this._queueFrame();

        } else if (this._waveOn) {
            this._waveOn = false;
            this._queueFrame();
        }
    }

    _renderFrame() {
        const gl = this._gl;

        this._renderRects(gl);
        this._renderText(gl);
        this._renderWave(gl);

        this._frameQueued = false;

        let hint_t = '';
        let hash_t = this._hashTextArray();
        if( hash_t != this._lastArrayHash ) {
            console.log( structuredClone( this._textArray ));
            let page = this._pageFromArray() + this._pageNumber( this._pageFromArray()  );
            if( this._lastPageName != page ) {
                this._lastPageName = page;
                this._currentPage = this._pageFromArray()
                console.log( `PAGE: ${page}` );
                tts.speak( page, 'page' );
            }
            let hint = this._textFromCoord(22,0,38);
            if( hint.replace(/\s+/,'') )
                hint_t = hint;
        }
        this._lastArrayHash = hash_t;

        let coord = this._coordFromRect();

        let hash_r = this._hashRect();
        let rect_t = this._textFromSelection();
        if( this._currentPage == 'INSTRUMENT' && 
            this._instrumentTypeText() == 'FMSYNTH ' &&
            ( coord.row == 12 || coord.row == 13 ) ) {
            console.log( this._selectRect );
            console.log( `TEXT: ${this._textFromSelection()}` );
            console.log( `LABEL: ${this._labelFromSelection()}` );
            if( this._selectRect.mode == 'value' )
                tts.speak( this._labelFromSelection(), 'value' );
        }

        if( hash_r != this._lastRectHash || rect_t != this._lastRectText) {
            console.log( this._selectRect );
            console.log( `TEXT: ${this._textFromSelection()}` );
            console.log( `LABEL: ${this._labelFromSelection()}` );
            if( this._selectRect.mode == 'value' ) {
                tts.speak( this._labelFromSelection(), 'value' );
            } else {
                let rows = Math.floor( (this._selectRect.h - 1)/ 10 );
                let cols = Math.floor( (this._selectRect.w - 1)/ 8 );
                    cols = cols > 3 ? Math.ceil( cols / 3) : 1;
                if( this._currentPage === 'PHRASE' && this._selectRect.x == 22 && cols >= 5 ) {
                    switch( this._selectRect.w ) {
                        case 105: cols = 4; break;
                        case 121: cols = 5; break;
                        case 153: cols = 6; break;
                        case 169: cols = 7; break;
                        case 201: cols = 8; break;
                        case 217: cols = 9; break;
                    }
                }
                let row_p = rows > 1 ? 's' : '';
                let col_p = cols > 1 ? 's' : '';
                tts.speak( `copy selection ... ${rows} row${row_p} ... ${cols} column${col_p}`, 'value' );
            }
        }
        this._lastRectHash = hash_r;
        this._lastRectText = rect_t;

        if( hint_t ) {
            console.log( `HINT: ${hint_t}` );
            tts.speak( `hint ... ${hint_t}`, 'hint' );
        }        
    }

    _queueFrame() {
        if (!this._frameQueued) {
            requestAnimationFrame(() => this._renderFrame());
            this._frameQueued = true;
        }
    }

    clear() {
        this._rectsClear = true;
        this._rectCount = 0;
        this._textChars.fill(0);
        this._textChars.updated = true;
        this._waveOn = false;

        this._queueFrame();
    }
}

function compileShader(gl, name, type) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, Shaders[name]);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(`Failed to compile shader (${name}): ${gl.getShaderInfoLog(shader)}`);

    return shader;
}

function linkProgram(gl, name, vertexShader, fragmentShader) {
    const program = gl.createProgram();

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(`Failed to link program (${name}): ${gl.getProgramInfoLog(program)}`);

    return program;
}

function buildProgram(gl, name) {
    return linkProgram(
        gl,
        name,
        compileShader(gl, `${name}_vert`, gl.VERTEX_SHADER),
        compileShader(gl, `${name}_frag`, gl.FRAGMENT_SHADER));
}
