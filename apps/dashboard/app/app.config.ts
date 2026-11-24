export default defineAppConfig({
  ui: {
    // Brand palette (docs/BRAND.md §5, D-065); scales defined in assets/css/main.css.
    colors: { primary: 'gula', neutral: 'kertas' },
    // Solid primary buttons are brand amber with an ink label (5.8:1), as on the
    // landing page, in both light and dark mode.
    button: {
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class:
            'text-kertas-900 bg-gula-500 hover:bg-gula-400 active:bg-gula-400 disabled:bg-gula-500 aria-disabled:bg-gula-500 outline-gula-500/40',
        },
      ],
    },
    // Keep a field's hint, the (?) help tip (D-056), right next to its label.
    formField: { slots: { labelWrapper: 'justify-start' } },
  },
})
