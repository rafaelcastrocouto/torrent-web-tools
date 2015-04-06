# torrent-web-tools

This is collection of tools for use with the Maelstrom web browser. They allow the creation and seeding of torrent files that contain static websites.


## Generator

[generator.py](generator.py) -- **Requires Python 2.7**

Generates torrent files from static website files.

**positional arguments:**
  * *INPUT* -- One or more files or directories. 'index.html' is required for the torrent to automatically render a web page in the browser.

**optional arguments:**
  * __-h__, __--help__ -- show this help message and exit
  * __--output__ *OUTPUT*, __-o__ *OUTPUT* -- Path for torrent file to be output. Defaults to the torrent name, as specified, or detected.
  * __--name__ *NAME* -- Name of the torrent, not seen in the browser.
  * __--tracker__ *[TRACKER [TRACKER ...]]* -- A tracker to include in the torrent. Not including a tracker means that the torrent can only be shared via magnet-link.
  * __--comment__ *COMMENT* -- A description or comment about the torrent. Not seen in the browser.
  * __--webseed__ *[URL [URL ...]]* A URL that contains the files present in the torrent. Used if normal BitTorrent seeds are unavailable. NOTE: Not compatible with magnet-links, must be used with a tracker.
  * __--piece-length__ *PIECE_LENGTH* -- Number of bytes in each piece of the torrent. MUST be a power of two (2^n). Smaller piece sizes allow web pages to load more quickly. Larger sizes hash more quickly. Default: 16384
  * __--include-hidden-files__ -- Includes files whose names begin with a '.', or are marked hidden in the filesystem.
  * __--no-optimize-file-order__ -- Disables intelligent reordering of files.
  * __-v__, __--verbose__ -- Enable verbose mode.


### Examples

__Basic usage example__
Most basic way to run, defining only an input directory. The contents of the directory are recursively included. The output torrent name will be automatically set to that of the input dir. No tracker or webseed is defined, and file order will be optimized.

```bash
> generator.py path/to/input/directory_name
```

You can specify an input directory, one or multiple individual files to include, or use a filesystem glob \(``` *.html```\).

__Output:__

```
Resolved input file(s) to:
	/path/to/input/directory_name
Detected torrent root folder: /path/to/input/directory_name
Magnet link (trackerless):   magnet:?xt=urn%3Abtih%3A<SOMEHASH>
Browser link (trackerless):  bittorrent://<SOMEHASH>
Output torrent: /current/path/directory_name.torrent
```

Either the magnet link or the browser link can be used in Maelstrom to view the page.

If you don't have an index.html in the torrent directory, you will receive a warning message.


### Seeding

Once you've generated a torrent, you'll need to seed it in order for other people to view its contents. To do so, add the torrent to uTorrent, set to find the files in their original location.

Note that seeding a torrent using clients other than uTorrent or BitTorrent may result in it not being reachable in the Maelstorm browser via magnet link.
