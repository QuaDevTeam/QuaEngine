// vite.config.ts
import { defineConfig } from "file:///Users/orchiliao/Projects/personal/QuaEngine/node_modules/.pnpm/vite@5.4.19_@types+node@24.1.0/node_modules/vite/dist/node/index.js";
import { resolve } from "node:path";
import dts from "file:///Users/orchiliao/Projects/personal/QuaEngine/node_modules/.pnpm/vite-plugin-dts@4.5.4_@types+node@24.1.0_rollup@4.46.2_typescript@5.8.3_vite@7.0.6_@typ_9690614ddcde7e39801f1b4d02a91388/node_modules/vite-plugin-dts/dist/index.mjs";
var __vite_injected_original_dirname = "/Users/orchiliao/Projects/personal/QuaEngine/packages/script-compiler";
var vite_config_default = defineConfig({
  plugins: [
    dts({
      include: ["src/**/*"],
      exclude: ["src/**/*.test.ts", "src/**/*.spec.ts"],
      outDir: "dist",
      insertTypesEntry: true,
      rollupTypes: true
    })
  ],
  build: {
    lib: {
      entry: {
        index: resolve(__vite_injected_original_dirname, "src/index.ts"),
        cli: resolve(__vite_injected_original_dirname, "src/cli.ts")
      },
      formats: ["es"]
    },
    rollupOptions: {
      external: [
        "node:fs",
        "node:path",
        "node:process",
        "node:url",
        "node:util",
        "@babel/parser",
        "@babel/traverse",
        "@babel/types",
        "@babel/generator",
        "uuid"
      ],
      output: {
        globals: {}
      }
    },
    target: "node18"
  },
  resolve: {
    alias: {
      "@": resolve(__vite_injected_original_dirname, "src")
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvb3JjaGlsaWFvL1Byb2plY3RzL3BlcnNvbmFsL1F1YUVuZ2luZS9wYWNrYWdlcy9zY3JpcHQtY29tcGlsZXJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9vcmNoaWxpYW8vUHJvamVjdHMvcGVyc29uYWwvUXVhRW5naW5lL3BhY2thZ2VzL3NjcmlwdC1jb21waWxlci92aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvb3JjaGlsaWFvL1Byb2plY3RzL3BlcnNvbmFsL1F1YUVuZ2luZS9wYWNrYWdlcy9zY3JpcHQtY29tcGlsZXIvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHsgcmVzb2x2ZSB9IGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCBkdHMgZnJvbSAndml0ZS1wbHVnaW4tZHRzJ1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbXG4gICAgZHRzKHtcbiAgICAgIGluY2x1ZGU6IFsnc3JjLyoqLyonXSxcbiAgICAgIGV4Y2x1ZGU6IFsnc3JjLyoqLyoudGVzdC50cycsICdzcmMvKiovKi5zcGVjLnRzJ10sXG4gICAgICBvdXREaXI6ICdkaXN0JyxcbiAgICAgIGluc2VydFR5cGVzRW50cnk6IHRydWUsXG4gICAgICByb2xsdXBUeXBlczogdHJ1ZSxcbiAgICB9KSxcbiAgXSxcbiAgYnVpbGQ6IHtcbiAgICBsaWI6IHtcbiAgICAgIGVudHJ5OiB7XG4gICAgICAgIGluZGV4OiByZXNvbHZlKGltcG9ydC5tZXRhLmRpcm5hbWUsICdzcmMvaW5kZXgudHMnKSxcbiAgICAgICAgY2xpOiByZXNvbHZlKGltcG9ydC5tZXRhLmRpcm5hbWUsICdzcmMvY2xpLnRzJylcbiAgICAgIH0sXG4gICAgICBmb3JtYXRzOiBbJ2VzJ10sXG4gICAgfSxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICBleHRlcm5hbDogW1xuICAgICAgICAnbm9kZTpmcycsIFxuICAgICAgICAnbm9kZTpwYXRoJywgXG4gICAgICAgICdub2RlOnByb2Nlc3MnLCBcbiAgICAgICAgJ25vZGU6dXJsJywgXG4gICAgICAgICdub2RlOnV0aWwnLFxuICAgICAgICAnQGJhYmVsL3BhcnNlcicsXG4gICAgICAgICdAYmFiZWwvdHJhdmVyc2UnLCBcbiAgICAgICAgJ0BiYWJlbC90eXBlcycsXG4gICAgICAgICdAYmFiZWwvZ2VuZXJhdG9yJyxcbiAgICAgICAgJ3V1aWQnXG4gICAgICBdLFxuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIGdsb2JhbHM6IHt9LFxuICAgICAgfSxcbiAgICB9LFxuICAgIHRhcmdldDogJ25vZGUxOCcsXG4gIH0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgJ0AnOiByZXNvbHZlKGltcG9ydC5tZXRhLmRpcm5hbWUsICdzcmMnKSxcbiAgICB9LFxuICB9LFxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBaVksU0FBUyxvQkFBb0I7QUFDOVosU0FBUyxlQUFlO0FBQ3hCLE9BQU8sU0FBUztBQUZoQixJQUFNLG1DQUFtQztBQUl6QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxJQUFJO0FBQUEsTUFDRixTQUFTLENBQUMsVUFBVTtBQUFBLE1BQ3BCLFNBQVMsQ0FBQyxvQkFBb0Isa0JBQWtCO0FBQUEsTUFDaEQsUUFBUTtBQUFBLE1BQ1Isa0JBQWtCO0FBQUEsTUFDbEIsYUFBYTtBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLEtBQUs7QUFBQSxNQUNILE9BQU87QUFBQSxRQUNMLE9BQU8sUUFBUSxrQ0FBcUIsY0FBYztBQUFBLFFBQ2xELEtBQUssUUFBUSxrQ0FBcUIsWUFBWTtBQUFBLE1BQ2hEO0FBQUEsTUFDQSxTQUFTLENBQUMsSUFBSTtBQUFBLElBQ2hCO0FBQUEsSUFDQSxlQUFlO0FBQUEsTUFDYixVQUFVO0FBQUEsUUFDUjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Y7QUFBQSxNQUNBLFFBQVE7QUFBQSxRQUNOLFNBQVMsQ0FBQztBQUFBLE1BQ1o7QUFBQSxJQUNGO0FBQUEsSUFDQSxRQUFRO0FBQUEsRUFDVjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxRQUFRLGtDQUFxQixLQUFLO0FBQUEsSUFDekM7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
