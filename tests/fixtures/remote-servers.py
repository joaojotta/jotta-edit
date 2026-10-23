"""Optional loopback-only integration servers; never used by the packaged app.
Install pyftpdlib and impacket into a temporary directory and set
JOTTA_PROTOCOL_TEST_PYTHONPATH to that directory when running the tests.
"""
import sys
protocol, root, port = sys.argv[1], sys.argv[2], int(sys.argv[3])
if protocol in ('ftp', 'ftp-list', 'ftp-mlsd-link', 'ftp-mlsd-link-only', 'ftp-list-physical-link', 'ftp-mlsd-physical-link', 'ftp-cwd-mlsd', 'ftp-cwd-list', 'ftp-empty-mlsd', 'ftp-first-empty-mlsd'):
    from pyftpdlib.authorizers import DummyAuthorizer
    from pyftpdlib.handlers import FTPHandler
    from pyftpdlib.servers import FTPServer
    authorizer = DummyAuthorizer()
    authorizer.add_user('test', 'test-password', root, perm='elradfmwMT')
    if protocol == 'ftp-empty-mlsd':
        def empty_mlsd(self, path):
            self.push_dtp_data(b'', cmd='MLSD')
            return path
        FTPHandler.ftp_MLSD = empty_mlsd
    if protocol == 'ftp-first-empty-mlsd':
        original_mlsd = FTPHandler.ftp_MLSD
        def first_empty_mlsd(self, path):
            if self.fs.cwd.endswith('/public_html') and not getattr(self, '_listed_public_html', False):
                self._listed_public_html = True
                self.push_dtp_data(b'', cmd='MLSD')
                return path
            return original_mlsd(self, path)
        FTPHandler.ftp_MLSD = first_empty_mlsd
    if protocol in ('ftp-list', 'ftp-list-physical-link', 'ftp-cwd-list'):
        def no_mlsd(self, path):
            self.respond('502 MLSD unavailable; use LIST')
        FTPHandler.ftp_MLSD = no_mlsd
    if protocol in ('ftp-cwd-mlsd', 'ftp-cwd-list'):
        # Some servers ignore listing path arguments and list only their CWD.
        command = 'ftp_MLSD' if protocol == 'ftp-cwd-mlsd' else 'ftp_LIST'
        original_listing = getattr(FTPHandler, command)
        def list_cwd(self, path):
            return original_listing(self, self.fs.ftp2fs(self.fs.cwd))
        setattr(FTPHandler, command, list_cwd)
    if protocol == 'ftp-mlsd-link-only':
        def no_list(self, path):
            self.respond('502 LIST unavailable; use MLSD')
        FTPHandler.ftp_LIST = no_list
    if protocol in ('ftp-mlsd-link', 'ftp-mlsd-link-only', 'ftp-mlsd-physical-link'):
        from pyftpdlib.filesystems import AbstractedFS
        class LinkFactsFS(AbstractedFS):
            def format_mlsx(self, basedir, listing, perms, facts, ignore_err=True):
                for line in super().format_mlsx(basedir, listing, perms, facts, ignore_err):
                    if line.endswith(b' public_html\r\n'):
                        line = line.replace(b'type=dir;', b'type=OS.unix=symlink;')
                    yield line
        FTPHandler.abstracted_fs = LinkFactsFS
    FTPHandler.authorizer = authorizer
    server = FTPServer(('127.0.0.1', port), FTPHandler)
    print('READY', flush=True)
    server.serve_forever()
else:
    from impacket.smbserver import SimpleSMBServer
    from impacket.ntlm import compute_lmhash, compute_nthash
    server = SimpleSMBServer(listenAddress='127.0.0.1', listenPort=port)
    server.addShare('share', root, '')
    server.setSMB2Support(True)
    server.addCredential('test', 0, compute_lmhash('test-password'), compute_nthash('test-password'))
    print('READY', flush=True)
    server.start()
