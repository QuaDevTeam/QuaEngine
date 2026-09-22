import { registerSingleton } from 'monaco-editor/esm/vs/platform/instantiation/common/extensions.js'
import { IProductService } from 'monaco-editor/esm/vs/platform/product/common/productService.js'

// Monaco 0.55's clipboard command asks for this service, which its standalone
// registry omits. Register before the first editor/API initializes that registry.
class EditorProductService {
  readonly quality = 'stable'
}
registerSingleton(IProductService, EditorProductService, 0)
