# M8 Headless Web Display

This is alternative frontend for [M8 Headless](https://github.com/DirtyWave/M8HeadlessFirmware) that provides full Text-to-Speech support!

It runs entirely in the browser and only needs to be hosted on a server to satisfy browser security policies. No network communication is involved.

Try it out at https://m8flow.kallistisoft.com

Features:

- In browser TTS coverage of all M8 functions (Google Chrome and Edge)
- Render the M8 display
- Route M8's audio out to the default audio output
- Keyboard and gamepad input
- Custom key/button mapping
- Touch-compatible on-screen keys
- Firmware loader
- Full offline support
- Installable as a [PWA](https://en.wikipedia.org/wiki/Progressive_web_application)

## Firmware Support
This application is sensitive to the version of the M8 firmware and currently only works with version 2.7.8 of M8 Headless Firmware. Support for later versions will be added soon.

The 2.7.8 firmware can be [downloaded here](https://raw.githubusercontent.com/Dirtywave/M8HeadlessFirmware/main/Releases/M8_V2_7_8_HEADLESS.hex), use your browsers 'save as' feature to save firmware file.


## Supported Platforms

The following should generally work, details are below.

- Chrome 89+ on macOS, Windows and Linux\*
- Edge 89+ on macOS and Windows

The web display uses the Web Serial API to communicate with the M8. This API is currently only supported by desktop versions of Google Chrome and Microsoft Edge in versions 89 or later. 

\*On Ubuntu and Debian systems (and perhaps others) users do not have permission to access the M8's serial port by default. You will need to add yourself to the `dialout` group and restart your login session/reboot. After this you should be able to connect normally.


# Keyboard Control Scheme
This application uses the default keyboard control scheme of `M8Headless. The following is a very short list of core commands. For the full list of functions and actions please download the [The M8 User Manual](https://cdn.shopify.com/s/files/1/0455/0485/6229/files/m8_operation_manual_v20230630.pdf?v=1688149581) which is available on the [Resources & Downloads] page of the Dirtywave website.

- **Arrow keys** for **navigation** and **data entry**
- **Shift and Arrow** for **interface page selection**
- **Space** for **start and stop**
- Letter **Z** for **Option**
- Letter **X** for **Edit**

## Navigating the Song Page
On the Song page holding down the **Option** key (**Z**) while pressing **Up** or **Down** will navigate a full page (16 rows) of the song matrix.

## Editing Values
To edit a value hold the edit key (**X**) and use the arrow keys to change the value:

- **Up** and **Down** change the value by **10**
- **Left** and **Right** change the value by **1**

To **Delete** a value press **Option and Edit**; keys (**Z and X**)

## Copy and Paste
To create a selection hold **Shift** and press the **Option** key (**Z**) this will begin **copy selection** mode and select the current cell. 

Repeatedly pressing **Shift Option** will change the selection mode:
- Current cell
- Current column
- Current row
- Entire page

Once a selection mode has been selected release the **Shift** key and alter the selection area using the **Arrow Keys**

After the desired selection area has been set the following actions can be taken:

- **Cut** selection by pressing **Option and Edit** keys (**Z and X**)
- **Copy** selection by pressing **Option** key (**Z**)

The buffered selection can then be pasted by pressing **Shift and Edit** key (**X**)




## Keyboard Note Input
The top two rows of the keyboard are used as a live musical keyboard, using the QWERTY layout the **A** key is the note **C-4** and the **quote** key is **F-5** with sharps residing on the top row; the letter **W** is **C sharp 4*

This musical keyboard can be used to audition instruments and to enter values into a pattern. Both the octave of the keyboard and the default velocity of entered notes can be changed.

- **Minus** and **Equal** change the octave of the keyboard
- **Bracket Left** and **Right** change the default note velocity

## Developing

To build this project you need a standard unix-like environment and a recent-ish version of [Node.js](https://nodejs.org/) (15.6 works, earlier versions might not). You should be able to build on macOS, Linux and [WSL](https://docs.microsoft.com/en-us/windows/wsl/) on Windows.

From a fresh clone, run this in your terminal:

```
make run
```

This will download the necessary node packages, build the files required to run a debug version of the display and launch a local web server. If this is successful you can open http://localhost:8000/ in Chrome to launch the display. Press `ctrl-c` to stop the server.

You can edit the `*.js` files and simply refresh the page to see the changes. If you edit the `*.scss` files or the shaders you will need to run `make` to regenerate the necessary files before refreshing. You can do this from another terminal window/tab, there is no need to restart the server.

Chrome requires that pages are served securely in order to enable features such as the Serial API. Normally this means using HTTPS but there is an exception when you use `localhost`. If you want to test your changes on another computer on your network you will need to run the local web server with HTTPS:

```
make run HTTPS=true
```

This will generate a certificate and the local web server will now work from `https://<your-computer-name>:8000` (the full list of addresses is shown in the command output). When you use this address you will need to either ignore the security warning or install the certificate at `cert/server.crt` as a trusted Certificate Authority on your device.

To build a release version of the display run:

```
make deploy
```

This will build and copy the release files to the `deploy/` directory. These files can be hosted on any static web server as long as has an HTTPS address.

## Known Bugs
* Unnamed instruments are being read out as 'dash dash dash etc'

## TODO/Ideas

- Provide feed back for the copy selection mode (cell,column,row,all)
- Add integrated application user's guide
- Expose controls for TTS speed and voice
- Avoid/automatically recover from bad frames
- Auto-reboot for firmware loader/real M8 support
- Selectable audio output device

## Licence

This code is released under the MIT licence.

See LICENSE for more details.
