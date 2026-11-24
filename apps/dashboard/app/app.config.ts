export default defineAppConfig({
  ui: {
    // Keep a field's hint, the (?) help tip (D-056), right next to its label.
    formField: { slots: { labelWrapper: 'justify-start' } },
  },
})
