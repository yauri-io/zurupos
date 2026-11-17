// A small ESC/POS byte builder (SPEC §11.3). Pure: same input, same bytes.
// Text is ASCII-safe: common Indonesian/Latin accents are transliterated and
// anything else becomes '?', so every printer's default codepage prints it.
import 'dart:typed_data';

enum Paper {
  mm58(32),
  mm80(48);

  const Paper(this.columns);

  /// Characters per line in the default font.
  final int columns;

  static Paper fromWidth(int mm) => mm == 80 ? mm80 : mm58;
  int get mm => this == mm80 ? 80 : 58;
}

enum Align { left, center, right }

/// Character size: normal; double height (same columns); quad = double width
/// and height (half the columns).
enum TextSize { normal, double, quad }

const _esc = 0x1B, _gs = 0x1D, _lf = 0x0A;

const _transliterate = {
  'à': 'a',
  'á': 'a',
  'â': 'a',
  'ä': 'a',
  'ã': 'a',
  'å': 'a',
  'À': 'A',
  'Á': 'A',
  'Â': 'A',
  'Ä': 'A',
  'è': 'e',
  'é': 'e',
  'ê': 'e',
  'ë': 'e',
  'È': 'E',
  'É': 'E',
  'Ê': 'E',
  'Ë': 'E',
  'ì': 'i',
  'í': 'i',
  'î': 'i',
  'ï': 'i',
  'Í': 'I',
  'Î': 'I',
  'ò': 'o',
  'ó': 'o',
  'ô': 'o',
  'ö': 'o',
  'õ': 'o',
  'Ó': 'O',
  'Ô': 'O',
  'Ö': 'O',
  'ù': 'u',
  'ú': 'u',
  'û': 'u',
  'ü': 'u',
  'Ú': 'U',
  'Ü': 'U',
  'ñ': 'n',
  'Ñ': 'N',
  'ç': 'c',
  'Ç': 'C',
  'ß': 'ss',
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  '•': '*',
  '×': 'x',
  ' ': ' ',
  '\t': ' ',
};

/// What reaches the printer: printable ASCII only.
String asciiSafe(String s) {
  final out = StringBuffer();
  for (final rune in s.runes) {
    final ch = String.fromCharCode(rune);
    if (rune >= 0x20 && rune < 0x7F) {
      out.write(ch);
    } else {
      out.write(_transliterate[ch] ?? (rune == 0x0A ? ' ' : '?'));
    }
  }
  return out.toString();
}

/// Greedy word wrap to [width] columns; words longer than a line are split.
List<String> wrap(String text, int width) {
  final lines = <String>[];
  var line = '';
  for (var word in asciiSafe(text).split(' ').where((w) => w.isNotEmpty)) {
    while (word.length > width) {
      if (line.isNotEmpty) {
        lines.add(line);
        line = '';
      }
      lines.add(word.substring(0, width));
      word = word.substring(width);
    }
    if (line.isEmpty) {
      line = word;
    } else if (line.length + 1 + word.length <= width) {
      line = '$line $word';
    } else {
      lines.add(line);
      line = word;
    }
  }
  if (line.isNotEmpty || lines.isEmpty) lines.add(line);
  return lines;
}

class EscPos {
  EscPos(this.paper) {
    _bytes.add([_esc, 0x40]); // initialize
    _bytes.add([_esc, 0x74, 0x00]); // codepage PC437; we only send ASCII
  }

  final Paper paper;
  final _bytes = BytesBuilder(copy: false);

  int get columns => paper.columns;

  Uint8List build() => _bytes.toBytes();

  void _raw(List<int> b) => _bytes.add(b);

  void align(Align a) => _raw([_esc, 0x61, a.index]);
  void bold(bool on) => _raw([_esc, 0x45, on ? 1 : 0]);
  void size(TextSize s) => _raw([
    _gs,
    0x21,
    switch (s) {
      TextSize.normal => 0x00,
      TextSize.double => 0x01,
      TextSize.quad => 0x11,
    },
  ]);

  /// One line, already fitting (truncated if not).
  void line([String text = '']) {
    final safe = asciiSafe(text);
    _raw([...(safe.length > columns ? safe.substring(0, columns) : safe).codeUnits, _lf]);
  }

  /// Wrapped text with optional style; style is reset afterwards, so between
  /// calls the printer is always left-aligned, normal size, not bold.
  void text(
    String text, {
    Align align = Align.left,
    bool bold = false,
    TextSize size = TextSize.normal,
    int indent = 0,
  }) {
    final width = (size == TextSize.quad ? columns ~/ 2 : columns) - indent;
    if (align != Align.left) this.align(align);
    if (bold) this.bold(true);
    if (size != TextSize.normal) this.size(size);
    for (final l in wrap(text, width)) {
      _raw([...'${' ' * indent}$l'.codeUnits, _lf]);
    }
    if (size != TextSize.normal) this.size(TextSize.normal);
    if (bold) this.bold(false);
    if (align != Align.left) this.align(Align.left);
  }

  /// Left text wrapped, right text on the last line, right-aligned.
  void columns2(String left, String right, {int indent = 0, bool bold = false}) {
    final r = asciiSafe(right);
    final pad = ' ' * indent;
    final lines = wrap(left, columns - indent - r.length - 1);
    if (bold) this.bold(true);
    for (var i = 0; i < lines.length; i++) {
      final l = '$pad${lines[i]}';
      if (i < lines.length - 1) {
        _raw([...l.codeUnits, _lf]);
      } else {
        _raw([...'$l${' ' * (columns - l.length - r.length)}$r'.codeUnits, _lf]);
      }
    }
    if (bold) this.bold(false);
  }

  void rule([String ch = '-']) => line(ch * columns);
  void feed(int lines) => _raw([_esc, 0x64, lines]);

  /// Feed and partial cut.
  void cut() => _raw([_gs, 0x56, 0x42, 0x00]);

  /// SPEC §11.3: ESC p 0 25 250.
  void drawerKick() => _raw([_esc, 0x70, 0x00, 25, 250]);
}
