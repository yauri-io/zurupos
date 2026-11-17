import 'package:flutter/material.dart';

/// − qty + with ≥ 48 dp targets.
class QtyStepper extends StatelessWidget {
  const QtyStepper({super.key, required this.qty, required this.onChanged, this.min = 0, this.max = 999});

  final int qty;
  final ValueChanged<int> onChanged;
  final int min;
  final int max;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      IconButton.outlined(
        key: const Key('qty-minus'),
        onPressed: qty > min ? () => onChanged(qty - 1) : null,
        icon: const Icon(Icons.remove),
      ),
      SizedBox(
        width: 40,
        child: Text('$qty', textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
      ),
      IconButton.outlined(
        key: const Key('qty-plus'),
        onPressed: qty < max ? () => onChanged(qty + 1) : null,
        icon: const Icon(Icons.add),
      ),
    ],
  );
}

/// Large numeric keys (PIN pad, cash pad). Emits digits, '⌫' and '00'.
class NumberPad extends StatelessWidget {
  const NumberPad({super.key, required this.onKey, this.showDoubleZero = false, this.keySize = 72});

  final ValueChanged<String> onKey;
  final bool showDoubleZero;
  final double keySize;

  @override
  Widget build(BuildContext context) {
    final rows = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      [showDoubleZero ? '00' : '', '0', '⌫'],
    ];
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final row in rows)
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final k in row)
                Padding(
                  padding: const EdgeInsets.all(4),
                  child: SizedBox.square(
                    dimension: keySize,
                    child: k.isEmpty
                        ? null
                        : FilledButton.tonal(
                            key: Key('key-$k'),
                            style: FilledButton.styleFrom(padding: EdgeInsets.zero),
                            onPressed: () => onKey(k),
                            child: k == '⌫'
                                ? const Icon(Icons.backspace_outlined)
                                : Text(k, style: Theme.of(context).textTheme.headlineSmall),
                          ),
                  ),
                ),
            ],
          ),
      ],
    );
  }
}
