import { defineConfig, type Plugin } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

function injectFloatingDeskPet(): Plugin {
  const pagePattern = /[\\/]src[\\/]pages[\\/](?!(?:account|profile)[\\/])[^\\/]+[\\/]index\.vue$/
  return {
    name: 'petcloud-floating-desk-pet',
    enforce: 'pre',
    transform(code, id) {
      const cleanId = id.split('?')[0]
      if (!pagePattern.test(cleanId) || code.includes('FloatingDeskPet')) return null
      const scriptMatch = code.match(/<script\s+setup\b[^>]*>/)
      const templateEnd = code.lastIndexOf('</template>')
      if (!scriptMatch || templateEnd < 0) return null
      const closeView = code.lastIndexOf('</view>', templateEnd)
      if (closeView < 0) return null
      const withComponent = code.slice(0, closeView) + '  <FloatingDeskPet />\n' + code.slice(closeView)
      const insertAt = withComponent.indexOf(scriptMatch[0]) + scriptMatch[0].length
      const transformed =
        withComponent.slice(0, insertAt) +
        "\nimport FloatingDeskPet from '../../components/FloatingDeskPet.vue'" +
        withComponent.slice(insertAt)
      return { code: transformed, map: null }
    },
  }
}

export default defineConfig({ plugins: [injectFloatingDeskPet(), uni()] })
