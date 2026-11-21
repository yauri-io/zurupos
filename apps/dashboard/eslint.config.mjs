import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // Prettier writes void elements as `<img />`; make the Vue rule agree.
    'vue/html-self-closing': ['warn', { html: { void: 'always', normal: 'always', component: 'always' } }],
  },
})
