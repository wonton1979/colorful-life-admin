export interface NativeEditFlags {
  canCut: boolean
  canCopy: boolean
  canPaste: boolean
  canSelectAll: boolean
}

export type NativeEditRole = 'cut' | 'copy' | 'paste' | 'selectAll'
export interface NativeEditMenuItem { role: NativeEditRole; enabled: boolean }
export interface NativeContextMenuParams extends NativeEditFlags { x: number; y: number; isEditable: boolean }

export function editContextMenuTemplate(isEditable: boolean, flags: NativeEditFlags): NativeEditMenuItem[] | null {
  if (!isEditable) return null
  return [
    { role: 'cut', enabled: flags.canCut },
    { role: 'copy', enabled: flags.canCopy },
    { role: 'paste', enabled: flags.canPaste },
    { role: 'selectAll', enabled: flags.canSelectAll },
  ]
}

export function handleEditContextMenu(
  event: { preventDefault(): void },
  params: NativeContextMenuParams,
  showMenu: (template: NativeEditMenuItem[], x: number, y: number) => void,
): void {
  event.preventDefault()
  const template = editContextMenuTemplate(params.isEditable, params)
  if (template) showMenu(template, params.x, params.y)
}
