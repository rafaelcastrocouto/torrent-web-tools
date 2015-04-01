import argparse
import ctypes
import os
from pprint import pprint
import string
from bencode import bencode
import time
from hashlib import sha1
import subprocess


GENERATOR_VERSION = '0.0.1'


def common_path_for_files(file_paths):
    # Note: os.path.commonprefix works on a per-char basis, not per path element
    common_prefix = os.path.commonprefix(file_paths)

    if not os.path.isdir(common_prefix):
        common_prefix = os.path.split(common_prefix)[0]  # break off invalid trailing element of path

    return common_prefix


def relativize_file_path(file_path, common_path):
    return file_path.replace("%s/" % common_path, '')


def split_path_components(file_path):
    return file_path.split(os.sep)


def collect_child_file_paths(path):
    return [os.path.join(dirpath, filename) for dirpath, dirname, filenames in os.walk(path) for filename in filenames]


def filter_hidden_files(file_paths):
    return [path for path in file_paths
            if not os.path.basename(os.path.abspath(path)).startswith('.') or has_hidden_attribute(path)]


def has_hidden_attribute(filepath):
    try:
        attrs = ctypes.windll.kernel32.GetFileAttributesW(unicode(filepath))
        assert attrs != -1
        result = bool(attrs & 2)
    except (AttributeError, AssertionError):
        result = False
    return result


def sha1_hash_for_data(data):
    return sha1(str(data)).digest()


def read_in_pieces(file_paths, piece_length):
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
    return ''.join(sha1_hash_for_data(piece) for piece in read_in_pieces(file_paths, piece_length))


def build_file_detail_dict(file_path, common_path, piece_length):
    rel_path = relativize_file_path(file_path, common_path)
    rel_path_components = split_path_components(rel_path)

    return {
        'name': rel_path_components[-1],
        'full_path': file_path,
        'rel_path': rel_path,
        'file_length': os.path.getsize(file_path),
        'rel_path_components': rel_path_components,
    }


def process_files(file_paths, piece_length, include_hidden):
    # TODO: order optimization
    # TODO: parallelize with joblib.Parallel

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

    file_details = [build_file_detail_dict(file_path, common_path, piece_length) for file_path in file_paths]

    pieces = hash_pieces_for_file_paths(file_paths, piece_length)

    return file_details, common_path, pieces


def build_torrent_dict(file_paths, name=None, trackers=None, webseeds=None, piece_length=16384, include_hidden=False):
    if trackers is None:
        trackers = []

    if webseeds is None:
        webseeds = []

    file_details, common_path, pieces = process_files(file_paths, piece_length, include_hidden)

    if name is None:
        if len(file_paths) == 1:
            # Single file mode
            name = os.path.basename(file_paths[0])
        else:
            # Multi file mode
            name = os.path.basename(common_path)

    torrent_dict = {
        'created by': 'TWT-Gen/%s' % GENERATOR_VERSION,
        'creation date': int(time.time()),
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
    with open(output_file_path, 'wb') as file_handle:
        file_handle.write(bencode(torrent_dict))


def file_or_dir(string):
    """
    For argparse: Takes a file or directory, makes sure it exists.
    """

    # TODO: do filesystem globbing here? Do we even need globbing? Might be done on the commandline.

    full_path = os.path.abspath(os.path.expandvars(os.path.expanduser(string)))

    if not os.path.exists(full_path):
        raise argparse.ArgumentTypeError("%r is not a file or directory." % string)

    return full_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generates torrent files from static website files.')

    parser.add_argument('input', metavar='INPUT', type=file_or_dir, nargs='+',
                        help="One or more files or directories. 'index.html' MUST be present in the torrent for it to "
                             "be viewable in a browser.")
    parser.add_argument('--output', '-o', type=str, required=True,
                        help="REQUIRED: A torrent file to be output.")
    parser.add_argument('--name', type=str, help="Name of the torrent, not seen in the browser.")

    # TODO: validate tracker URLs
    parser.add_argument('--tracker', type=str, nargs="*", dest='trackers',
                        help="A tracker to include in the torrent. "
                             "Not including a tracker means that the torrent can only be shared via magnet-link.")
    parser.add_argument('--comment', type=str,
                        help="A description or comment about the torrent. Not seen in the browser.")

    # TODO: validate webseeds
    parser.add_argument('--webseed', type=str, nargs='*', dest='webseeds',
                        help="A URL that contains the files present in the torrent. "
                             "Used if normal BitTorrent seeds are unavailable. "
                             "NOTE: Not compatible with magnet-links, must be used with a tracker.")

    # https://wiki.theory.org/BitTorrentSpecification#Info_Dictionary  <-- contains piece size recommendations
    parser.add_argument('--piece-length', type=int, default=16384, dest='piece_length',
                        help="Number of bytes in each piece of the torrent. "
                             "Smaller piece sizes allow web pages to load more quickly.")
    parser.add_argument('--optimize-file-order', action='store_true',
                        help="Checks if files in the torrent are referenced from the index.html, "
                             "then places them toward the beginning of the torrent.")
    parser.add_argument('--include-hidden-files', action='store_true',
                        help="Includes files whose names begin with a '.', or are marked hidden in the filesystem.")

    args = parser.parse_args()

    torrent_dict = build_torrent_dict(file_paths=args.input,
                                      name=args.name,
                                      trackers=args.trackers,
                                      webseeds=args.webseeds,
                                      piece_length=args.piece_length,
                                      include_hidden=args.include_hidden_files)
    write_torrent_file(torrent_dict, args.output)

    print("Built torrent with data:")
    pprint(torrent_dict)
    print("Output torrent: %s" % args.output)
