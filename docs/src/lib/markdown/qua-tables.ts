interface Node {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
}

// Keep the table's native column layout; its wrapper owns overflow and framing.
export function quaTables() {
  return (tree: unknown) => {
    function visit(node: Node) {
      if (node.properties?.['data-qua-table']) return;
      node.children = node.children?.map(child => {
        if (child.type === 'element' && child.tagName === 'table') {
          return {
            type: 'element',
            tagName: 'div',
            properties: {
              className: ['qua-table-scroll'], 'data-qua-table': 'true',
              tabIndex: 0, role: 'region', 'aria-label': '表格'
            },
            children: [child]
          };
        }
        visit(child);
        return child;
      });
    }
    visit(tree as Node);
  };
}
