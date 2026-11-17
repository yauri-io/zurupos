// Turns ESC/POS bytes into readable text for golden files and width checks.
import 'dart:typed_data';

class Decoded {
  Decoded(this.text, this.overflows);

  /// Commands as [TAGS], text lines as-is.
  final String text;

  /// Printed lines wider than the paper at their character size.
  final List<String> overflows;
}

Decoded decode(Uint8List b, int columns) {
  final out = StringBuffer();
  final overflows = <String>[];
  var line = StringBuffer();
  var width = columns;
  var i = 0;
  int at(int k) => i + k < b.length ? b[i + k] : -1;
  while (i < b.length) {
    final c = b[i];
    if (c == 0x1B && at(1) == 0x40) {
      out.write('[INIT]');
      i += 2;
    } else if (c == 0x1B && at(1) == 0x74) {
      out.write('[CP ${at(2)}]');
      i += 3;
    } else if (c == 0x1B && at(1) == 0x61) {
      out.write('[${['LEFT', 'CENTER', 'RIGHT'][at(2)]}]');
      i += 3;
    } else if (c == 0x1B && at(1) == 0x45) {
      out.write(at(2) == 1 ? '[B]' : '[/B]');
      i += 3;
    } else if (c == 0x1D && at(1) == 0x21) {
      final n = at(2);
      width = n == 0x11 ? columns ~/ 2 : columns;
      out.write(switch (n) {
        0x00 => '[NORMAL]',
        0x01 => '[DOUBLE]',
        0x11 => '[QUAD]',
        _ => '[SIZE $n]',
      });
      i += 3;
    } else if (c == 0x1B && at(1) == 0x64) {
      out.write('[FEED ${at(2)}]');
      i += 3;
    } else if (c == 0x1D && at(1) == 0x56) {
      out.write('[CUT]');
      i += 4;
    } else if (c == 0x1B && at(1) == 0x70) {
      out.write('[DRAWER ${at(2)} ${at(3)} ${at(4)}]');
      i += 5;
    } else if (c == 0x0A) {
      final l = line.toString();
      if (l.length > width) overflows.add(l);
      out.writeln('|$l|');
      line = StringBuffer();
      i += 1;
    } else if (c >= 0x20 && c < 0x7F) {
      line.writeCharCode(c);
      i += 1;
    } else {
      throw StateError('unexpected byte 0x${c.toRadixString(16)} at $i');
    }
  }
  if (line.isNotEmpty) out.write(line);
  return Decoded(out.toString(), overflows);
}
