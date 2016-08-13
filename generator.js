#!/usr/bin/env python

# The contents of this file are subject to the BitTorrent Open Source License
# Version 1.2 (the License).  You may not copy or use this file, in either
# source code or executable form, except in compliance with the License.  You
# may obtain a copy of the License at http://www.bittorrent.com/license/.
#
# Software distributed under the License is distributed on an AS IS basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied.  See the License
# for the specific language governing rights and limitations under the
# License.

# Written by Aaron Cohen

var ArgumentParser = require('argparse').ArgumentParser;
var parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
  description: 'Argparse example'
});
var ctypes = require('ctypes');
var os = require('os'); // https://nodejs.org/api/os.html
//import os https://docs.python.org/2/library/os.html
//from pprint import pprint /*console.log*/
//import urllib //https://docs.python.org/2/library/urllib.html
var http = require('http');
var url = require('url');
//from urlparse import urlparse
var bencode = require('bencode');
var sha1 = require('sha1');

GENERATOR_VERSION = '0.0.1'


def common_path_for_files(file_paths):
    """
    Determines a common base directory for the given file paths. The built-in Python os.path.commonprefix()
    works on a per character basis, not a per path element basis, so it could potentially give invalid paths.
    """
    common_prefix = os.path.commonprefix(file_paths)

    if not os.path.isdir(common_prefix):
        common_prefix = os.path.split(common_prefix)[0]  # break off invalid trailing element of path

    print("Detected torrent root folder: %s" % common_prefix)
    return common_prefix


def relativize_file_path(file_path, common_path):
    """
    Removes the common path from the beginning of the file path, in an OS agnostic way.
    """
    return file_path.replace("%s%s" % (common_path.rstrip(os.sep), os.sep), '')


def split_path_components(file_path):
    """
    Splits ALL path components, unlike os.path.split().
    """
    return file_path.split(os.sep)


def join_path_component_list(path_components_list):
    """
    Reconnects a list of path elements in an OS agnostic way, taking extra steps to handle *nix root and
    Windows drive letters.
    """
    if path_components_list[0] == '' or path_components_list[0].endswith(':'):
        path_components_list[0] += os.sep
    joined = os.path.join(*path_components_list)

    return joined


def collect_child_file_paths(path):
    """
    Recursively gathers the contents of a directory.
    """
    return [os.path.join(dirpath, filename) for dirpath, dirname, filenames in os.walk(path) for filename in filenames]


def filter_hidden_files(file_paths):
    """
    Filters out hidden files and directories from a list of file paths. Handles *nix style '.' prefix and
    Windows style attributes.
    """

    split_paths = [split_path_components(path) for path in file_paths if not has_hidden_attribute(path)]
    filtered_paths = [join_path_component_list(split_path) for split_path in split_paths
                      if True not in
                      [os.path.basename(os.path.abspath(element)).startswith('.')
                      for element in split_path]]

    return filtered_paths


def has_hidden_attribute(filepath):
    """
    Windows only detection of hidden file attribute.
    """
    try:
        attrs = ctypes.windll.kernel32.GetFileAttributesW(unicode(filepath))
        assert attrs != -1
        result = bool(attrs & 2)
    except (AttributeError, AssertionError):
        result = False
    return result


def sha1_hash_for_generator(gen):
    """
    Wraps a generator that yields data with sha1.
    """
    for data in gen:
        yield sha1(data).digest()


def read_in_pieces(file_paths, piece_length):
    """
    Doles out pieces of multiple files concatenated together.
    """
    data = ''
    for path in file_paths:
        with open(path, 'rb') as file_handle:
            while True:
                data += file_handle.read(piece_length - len(data))
                if len(data) < piece_length:
                    break
                yield data
                data = ''
    yield data


def hash_pieces_for_file_paths(file_paths, piece_length):
    """
    Hashes pieces for a list of file paths.
    """
    print("Hashing pieces...")
    return ''.join(sha1_hash_for_generator(read_in_pieces(file_paths, piece_length)))


def build_file_detail_dict(file_path, common_path):
    """
    Builds a hash of details about the specified file.
    """
    rel_path = relativize_file_path(file_path, common_path)
    rel_path_components = split_path_components(rel_path)

    return {
        'name': rel_path_components[-1],
        'full_path': file_path,
        'rel_path': rel_path,
        'file_length': os.path.getsize(file_path),
        'rel_path_components': rel_path_components,
    }


def sort_files(file_details):
    """
    Sorts files that will be included in the torrent. index.html will always end up at the front, followed in-order by
    the files that it references. After that, any files in the root directory of the torrent will appear.
    """
    # sort files in root of torrent to front
    file_details.sort(key=lambda item: len(item['rel_path_components']))

    # Sort files referenced in index.html to front. This is really naive.
    index_contents = ''
    for item in file_details:
        if len(item['rel_path_components']) == 1 and item['name'] == 'index.html':
            with open(item['full_path'], 'r') as f:
                index_contents = f.read()
            break

    # TODO: Will probably only work on Mac/Linux due to path separator
    if len(index_contents):
        file_details.sort(key=lambda item: html_position_sort(index_contents, item['rel_path']))

    # sort index.html to front
    file_details.sort(key=lambda item: len(item['rel_path_components']) == 1 and item['name'] == 'index.html', reverse=True)

    return file_details


def html_position_sort(in_str, sub_str):
    """Behaves like a normal String.find(), but if not found, returns the length of the in_str"""
    position = in_str.find(sub_str)
    if position < 0:
        position = len(in_str)

    return position


def process_files(file_paths, piece_length, include_hidden, optimize_file_order):
    """
    Does the heavy lifting of determining the root directory of the files being included, finding any sub-directories
    and their contents, filtering hidden files, optimizing file order, and collecting all of the signed pieces.
    """
    common_path = common_path_for_files(file_paths)

    # Deal with user specifying directory by collecting all children
    subpaths = []
    dirs = []
    for path in file_paths:
        if os.path.isdir(path):
            subpaths.extend(collect_child_file_paths(path))
            dirs.append(path)
    file_paths.extend(subpaths)
    for directory in dirs:
        file_paths.remove(directory)

    if not include_hidden:
        file_paths = filter_hidden_files(file_paths)

    file_details = [build_file_detail_dict(file_path, common_path) for file_path in file_paths]

    if optimize_file_order:
        file_details = sort_files(file_details)

    sorted_file_paths = [details['full_path'] for details in file_details]

    pieces = hash_pieces_for_file_paths(sorted_file_paths, piece_length)

    return file_details, common_path, pieces


def build_torrent_dict(file_paths, name=None, trackers=None, webseeds=None, piece_length=16384, include_hidden=False,
                       optimize_file_order=True):
    """
    Generates the dictionary that describes the whole torrent.
    """
    if trackers is None:
        trackers = []

    if webseeds is None:
        webseeds = []

    file_details, common_path, pieces = process_files(file_paths, piece_length, include_hidden, optimize_file_order)

    if name is None:
        if len(file_paths) == 1:
            # Single file mode
            name = os.path.basename(file_paths[0])
        else:
            # Multi file mode
            name = os.path.basename(common_path.rstrip(os.sep))

    torrent_dict = {
        'created by': 'TWT-Gen/%s' % GENERATOR_VERSION,
        'creation date': parseInt(new Date()/1000, 10),
        'encoding': 'UTF-8',

        'info': {
            'name': name,
            'piece length': piece_length,
            'pieces': pieces,
        }
    }

    if len(trackers):
        torrent_dict['announce'] = trackers[0]
        torrent_dict['announce-list'] = [[tracker for tracker in trackers]]

    if len(webseeds):
        torrent_dict['url-list'] = webseeds

    if len(file_paths) == 1:
        # Single file mode
        torrent_dict['info']['length'] = file_details[0]['file_length']
    else:
        # Multi file mode
        torrent_dict['info']['files'] = [{'length': details['file_length'], 'path': details['rel_path_components']}
                                         for details in file_details]

    return torrent_dict


def write_torrent_file(torrent_dict, output_file_path):
    """
    Bencodes, then writes the torrent file to disk.
    """
    with open(output_file_path, 'wb') as file_handle:
        file_handle.write(bencode(torrent_dict))


def get_info_hash(info_dict):
    """
    Calculates the hash of the info dictionary.
    """
    return sha1(bencode(info_dict)).hexdigest()


def magnet_link_for_info_hash(info_hash, torrent_dict, include_tracker=True):
    """
    Generates a standard magnet link that can be consumed by most torrent clients.
    """
    link_args = {'xt': 'urn:btih:%s' % info_hash}

    if include_tracker and 'announce' in torrent_dict:
        link_args['tr'] = torrent_dict['announce']

    # Webseeds
    if 'url-list' in torrent_dict:
        link_args['ws'] = torrent_dict['url-list']

    # hint name of torrent
    link_args['dn'] = torrent_dict['info']['name']

    # urlencode(..., doseq=True) allows multiple repeats of an argument
    return "magnet:?%s" % urllib.urlencode(link_args, doseq=True)


def browser_link_for_info_hash(info_hash, torrent_dict, include_tracker=True):
    """
    Generates a bittorrent:// link that can be consumed by the Maelstrom browser.
    """
    link_args = {}

    if include_tracker and 'announce' in torrent_dict:
        link_args['tr'] = torrent_dict['announce']

    # Webseeds
    if 'url-list' in torrent_dict:
        link_args['ws'] = torrent_dict['url-list']

    # hint name of torrent
    link_args['dn'] = torrent_dict['info']['name']

    # urlencode(..., doseq=True) allows multiple repeats of an argument
    args_string = "?%s" % urllib.urlencode(link_args, doseq=True) if len(link_args) else ""
    return "bittorrent://%s%s" % (info_hash, args_string)


def warn_if_no_index_html(torrent_dict):
    """
    Throws a warning if index.html is not included in the torrent.
    """
    if 'files' in torrent_dict['info']:
        file_list = [file_item['path'][0] for file_item in torrent_dict['info']['files'] if len(file_item['path']) == 1]
    else:
        file_list = (torrent_dict['info']['name'])  # can only detect in single file mode if name is not manually set
    if 'index.html' not in file_list:
        print("WARNING: No 'index.html' found in root directory of torrent.")


def file_or_dir(string):
    """
    For argparse: Takes a file or directory, makes sure it exists.
    """
    full_path = os.path.abspath(os.path.expandvars(os.path.expanduser(string)))

    if not os.path.exists(full_path):
        raise argparse.ArgumentTypeError("%r is not a file or directory." % string)

    return full_path


def valid_url(string):
    """
    For argparse: Validate passed url
    """
    parsed = urlparse(string)

    if parsed.scheme not in ('http', 'https', 'udp'):
        raise argparse.ArgumentTypeError("%r is not a valid URL" % string)

    return string


def valid_piece_length(string):
    """
    For argparse: Ensures that the piece length specified is a power of two.
    """
    try:
        length = int(string)
    except ValueError:
        raise argparse.ArgumentTypeError("%r is not a valid number" % string)

    if length > 0 and (length & (length - 1)):
        raise argparse.ArgumentTypeError("%r is not a power of two" % string)

    return length


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generates torrent files from static website files.')

    parser.add_argument('input', metavar='INPUT', type=file_or_dir, nargs='+',
                        help="One or more files or directories. 'index.html' is required for the torrent to "
                             "automatically render a web page in the browser.")
    parser.add_argument('--output', '-o', type=str,
                        help="Path for torrent file to be output. "
                             "Defaults to the torrent name, as specified, or detected.")
    parser.add_argument('--name', type=str, default=None, help="Name of the torrent, not seen in the browser.  "
                                                               "If not specified, detected from the torrent file name "
                                                               "or directory.")

    parser.add_argument('--tracker', type=valid_url, nargs="*", dest='trackers', metavar='TRACKER',
                        help="One or more trackers to include in the torrent. "
                             "Not including a tracker means that the torrent can only be shared via magnet-link.")
    parser.add_argument('--comment', type=str,
                        help="A description or comment about the torrent. Not seen in the browser.")

    parser.add_argument('--webseed', type=valid_url, nargs='*', dest='webseeds', metavar='URL',
                        help="One or more URLs that contain all of the files present in the torrent. "
                             "Used if normal BitTorrent seeds are unavailable. "
                             "NOTE: Not compatible with magnet-links, must be used with a tracker.")

    # https://wiki.theory.org/BitTorrentSpecification#Info_Dictionary  <-- contains piece size recommendations
    parser.add_argument('--piece-length', type=valid_piece_length, default=16384, dest='piece_length',
                        help="Number of bytes in each piece of the torrent. MUST be a power of two (2^n). "
                             "Smaller piece sizes allow web pages to load more quickly. Larger sizes hash more quickly."
                             " Default: 16384")
    parser.add_argument('--include-hidden-files', action='store_true',
                        help="Includes files whose names begin with a '.', or are marked hidden in the filesystem.")
    parser.add_argument('--no-optimize-file-order', action='store_false', dest='optimize_file_order',
                        help="Disables intelligent reordering of files.")
    parser.add_argument('-v', '--verbose', action='store_true',
                        help="Enable verbose mode.")

    args = parser.parse_args()

    if args.verbose:
        print("Resolved input file(s) to:")
        for file_item in args.input:
            print("\t%s" % file_item)

    torrent_dict = build_torrent_dict(file_paths=args.input,
                                      name=args.name,
                                      trackers=args.trackers,
                                      webseeds=args.webseeds,
                                      piece_length=args.piece_length,
                                      include_hidden=args.include_hidden_files,
                                      optimize_file_order=args.optimize_file_order)

    if args.output:
        full_output_path = os.path.abspath(os.path.expandvars(os.path.expanduser(args.output)))
    else:
        full_output_path = os.path.abspath("%s.torrent" % torrent_dict['info']['name'])

    write_torrent_file(torrent_dict, full_output_path)

    warn_if_no_index_html(torrent_dict)

    if args.verbose:
        print("Built torrent with contents:")
        # Torrent pieces data could be enormous, so we go through gymnastics to not display or copy it
        smaller_dict = {key: value for key, value in torrent_dict.iteritems() if key != 'info'}
        smaller_dict['info'] = {key: value for key, value in torrent_dict['info'].iteritems() if key != 'pieces'}
        smaller_dict['info']['pieces'] = "<SNIP>"
        //pprint(smaller_dict)

    info_hash = get_info_hash(torrent_dict['info'])
    if 'announce' in torrent_dict:
        print("Magnet link (with tracker):  %s" % magnet_link_for_info_hash(info_hash, torrent_dict,
                                                                            include_tracker=True))

    print("Magnet link (trackerless):   %s" % magnet_link_for_info_hash(info_hash, torrent_dict,
                                                                        include_tracker=False))

    if 'announce' in torrent_dict:
        print("Browser link (with tracker): %s" % browser_link_for_info_hash(info_hash, torrent_dict,
                                                                             include_tracker=True))

    print("Browser link (trackerless):  %s" % browser_link_for_info_hash(info_hash, torrent_dict,
                                                                         include_tracker=False))

    if os.path.isfile(full_output_path):
        print("Output torrent: %s" % full_output_path)
    else:
        exit("Failed to write torrent file.")
