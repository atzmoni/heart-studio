#!/usr/bin/perl
# Heart Studio offline web server for macOS (and Linux), started by "Start Heart Studio.command".
# Serves the studio folder on http://127.0.0.1:8765 using only Perl's core modules, which ship with macOS:
# no internet, no install. Prints "ready" once listening, "running" if a launcher is already serving, and exits 1 otherwise.
use strict;
use warnings;
use IO::Socket::INET;
use IO::Select;
use File::Spec;
use Cwd qw(abs_path);
use FindBin qw($Bin);

my $port = 8765;
my $root = abs_path("$Bin/..");
my $ping = "heart-studio-launcher";
$| = 1;
$SIG{PIPE} = "IGNORE";

my %types = (
  html => "text/html; charset=utf-8", js => "text/javascript; charset=utf-8", mjs => "text/javascript; charset=utf-8",
  css => "text/css; charset=utf-8", json => "application/json", webmanifest => "application/manifest+json",
  svg => "image/svg+xml", png => "image/png", jpg => "image/jpeg", jpeg => "image/jpeg", gif => "image/gif",
  webp => "image/webp", ico => "image/x-icon", woff2 => "font/woff2", woff => "font/woff", ttf => "font/ttf",
  mp4 => "video/mp4", webm => "video/webm", mov => "video/quicktime", mp3 => "audio/mpeg", wav => "audio/wav",
  ogg => "audio/ogg", m4a => "audio/mp4", txt => "text/plain; charset=utf-8", md => "text/plain; charset=utf-8",
);

my $server = IO::Socket::INET->new(LocalAddr => "127.0.0.1", LocalPort => $port, Proto => "tcp", Listen => 32, ReuseAddr => 1);
unless ($server) {
  # Already running (a second double-click)? Then the caller just opens another window on it.
  my $c = IO::Socket::INET->new(PeerAddr => "127.0.0.1", PeerPort => $port, Proto => "tcp", Timeout => 2);
  if ($c) {
    print $c "GET /.ping HTTP/1.0\r\n\r\n";
    local $/; my $r = <$c> // "";
    if ($r =~ /\Q$ping\E/) { print "running\n"; exit 0; }
  }
  print "busy\n"; exit 1;
}
print "ready\n";

sub send_reply {
  my ($c, $code, $reason, $type, $body, $head) = @_;
  print $c "HTTP/1.1 $code $reason\r\nContent-Type: $type\r\nContent-Length: " . length($body) .
           "\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n";
  print $c $body unless $head;
}

sub serve {
  my ($c, $req) = @_;
  my ($method, $target) = $req =~ /^(\S+)\s+(\S+)/ or return;
  my $head = $method eq "HEAD";
  return send_reply($c, 405, "Method Not Allowed", "text/plain", "GET only", 0) unless $method eq "GET" || $head;
  (my $path = $target) =~ s/[?#].*//s;
  $path =~ s/%([0-9A-Fa-f]{2})/chr(hex($1))/ge;
  return send_reply($c, 200, "OK", "text/plain", $ping, $head) if $path eq "/.ping";
  $path .= "index.html" if $path =~ m{/$};
  my $full = abs_path(File::Spec->catfile($root, $path));
  unless (defined $full && index($full, "$root/") == 0 && -f $full && open(my $fh, "<:raw", $full)) {
    return send_reply($c, 404, "Not Found", "text/plain", "Not found", $head);
  }
  else {
    local $/; my $body = <$fh> // ""; close $fh;
    my ($ext) = $full =~ /\.([^.\/]+)$/;
    send_reply($c, 200, "OK", $types{lc($ext // "")} // "application/octet-stream", $body, $head);
  }
}

# Browsers open spare connections and leave some idle, so nothing here blocks on one connection: requests are read as
# their bytes arrive, and silent connections are dropped after 30 seconds.
my $sel = IO::Select->new($server);
my (%buf, %since);
while (1) {
  for my $s ($sel->can_read(1)) {
    if ($s == $server) {
      my $c = $server->accept or next;
      binmode $c; $sel->add($c); $buf{$c} = ""; $since{$c} = time;
      next;
    }
    my $n = sysread($s, my $chunk, 16384);
    if ($n) { $buf{$s} .= $chunk; }
    if (!$n || $buf{$s} =~ /\r\n\r\n/ || length($buf{$s}) > 65536) {
      eval { serve($s, $buf{$s}) if $n; 1 };
      $sel->remove($s); close $s; delete $buf{$s}; delete $since{$s};
    }
  }
  for my $s ($sel->handles) {
    next if $s == $server || time - $since{$s} < 30;
    $sel->remove($s); close $s; delete $buf{$s}; delete $since{$s};
  }
}
