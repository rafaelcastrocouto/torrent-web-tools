# torrent-web-tools

This is collection of tools for use with the Maelstrom web browser. They allow the creation and seeding of torrent files that contain static websites.


Generator
---------

[generator.py](generator.py)

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
