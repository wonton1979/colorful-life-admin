# React + TypeScript + Vite

## Electron development

Run `npm run dev` to start Vite, compile Electron TypeScript in watch mode, wait for both resources, and open the Electron window.

## Catalogue presentation management

After signing in, the Presentation management panel loads active listings from `GET /products` and uses listing IDs for all presentation actions. The backend `isFeatureProduct` value is the only source of Feature/Standard state. `PATCH /products/:id/feature` is atomic and category-scoped; the Admin refreshes the catalogue after it succeeds. The backend does not expose a Feature-clear operation, so the Admin only offers selecting or changing a Feature listing.

Catalogue artwork is separate from `listingImages`. The Admin sends artwork files through the backend with `PUT /products/:id/catalogue-artwork` and removes them with `DELETE /products/:id/catalogue-artwork`. It displays the backend-returned `catalogueArtworkUrl` directly and keeps `catalogueArtworkPublicId` as storage metadata. The backend enforces JPEG, PNG, or WebP files up to 8 MiB and owns the Cloudinary credentials and storage namespace.

For local upload testing, run the backend with its Issue #92 database migration and Cloudinary configuration, then set `COLORFUL_LIFE_BACKEND_URL` for the Admin. No Cloudinary credentials are needed in this project.

Run `npm run build` to build the renderer into `dist/` and compile the Electron main/preload files into `dist-electron/`. `npm run electron` then loads the built renderer from `dist/index.html`.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
