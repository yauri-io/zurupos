// SPEC §11.1 #1, §5.2: an owner/manager pairs the device once.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_error.dart';
import '../../state/auth.dart';
import '../common.dart';
import '../widgets/language_toggle.dart';

class PairScreen extends ConsumerStatefulWidget {
  const PairScreen({super.key});

  @override
  ConsumerState<PairScreen> createState() => _PairScreenState();
}

class _PairScreenState extends ConsumerState<PairScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _device = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _device.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    final l = context.l10n;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final shop = await ref
          .read(authProvider.notifier)
          .pair(email: _email.text.trim(), password: _password.text, deviceName: _device.text.trim());
      if (mounted) showMessage(context, l.pairDone(shop));
    } on ApiException catch (e) {
      setState(() => _error = e.status == 401 || e.status == 403 ? l.pairInvalid : errorText(l, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = context.l10n;
    String? required(String? v) => (v ?? '').trim().isEmpty ? l.commonRequired : null;
    return Scaffold(
      appBar: AppBar(title: Text(l.appName), actions: const [LanguageToggle()]),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Form(
              key: _form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(l.pairTitle, style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 8),
                  Text(l.pairSubtitle),
                  const SizedBox(height: 24),
                  TextFormField(
                    key: const Key('pair-email'),
                    controller: _email,
                    decoration: InputDecoration(labelText: l.pairEmail),
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    validator: required,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    key: const Key('pair-password'),
                    controller: _password,
                    decoration: InputDecoration(labelText: l.pairPassword),
                    obscureText: true,
                    validator: required,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    key: const Key('pair-device'),
                    controller: _device,
                    decoration: InputDecoration(labelText: l.pairDeviceName, hintText: l.pairDeviceNameHint),
                    maxLength: 60,
                    validator: required,
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 8),
                    Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ],
                  const SizedBox(height: 16),
                  FilledButton(
                    key: const Key('pair-submit'),
                    style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                    onPressed: _busy ? null : _submit,
                    child: _busy ? const CircularProgressIndicator() : Text(l.pairSubmit),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
