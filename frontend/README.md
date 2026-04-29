# React + Vite

## Tailwind v4 Notes

This project uses Tailwind CSS v4 with the Vite plugin integration.

- Do use the normal app scripts: `npm run dev`, `npm run build`.
- Do not run `npx tailwindcss init -p` in this project. That is a Tailwind v3-style setup command and causes the npm executable resolution error you encountered.

Tailwind is enabled through:

- Vite plugin: `@tailwindcss/vite`
- Styles entry: `src/index.css` with `@import "tailwindcss";`

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
