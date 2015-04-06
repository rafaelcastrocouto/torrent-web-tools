# torrent-web-tools

This is collection of tools for use with the Maelstrom web browser. They allow the creation and seeding of torrent files that contain static websites.


Generator
---------

[generator.py](generator.py)

Generates torrent files from static website files.

**positional arguments:**
  * INPUT -- One or more files or directories. 'index.html' MUST be present in the torrent for it to be viewable in a browser.

**optional arguments:**
  * -h, --help -- show this help message and exit
  * --output OUTPUT, -o OUTPUT -- Path for torrent file to be output. Defaults to the torrent name, as specified, or detected.
  * --name NAME -- Name of the torrent, not seen in the browser.
  * --tracker [TRACKER [TRACKER ...]] -- A tracker to include in the torrent. Not including a tracker means that the torrent can only be shared via magnet-link.
  * --comment COMMENT -- A description or comment about the torrent. Not seen in the browser.
  * --webseed [URL [URL ...]] A URL that contains the files present in the torrent. Used if normal BitTorrent seeds are unavailable. NOTE: Not compatible with magnet-links, must be used with a tracker.
  * --piece-length PIECE_LENGTH -- Number of bytes in each piece of the torrent. MUST be a power of two (2^n). Smaller piece sizes allow web pages to load more quickly. Larger sizes hash more quickly. Default: 16384
  * --include-hidden-files -- Includes files whose names begin with a '.', or are marked hidden in the filesystem.
  * --no-optimize-file-order -- Disables intelligent reordering of files.
  * -v, --verbose -- Enable verbose mode.
