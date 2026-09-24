import { describe, expect, it, vi } from 'vitest'
import { editContextMenuTemplate, handleEditContextMenu } from '../electron/edit-context-menu'

describe('native edit context menu', () => {
  it('provides only the native editing actions for editable controls', () => {
    expect(editContextMenuTemplate(true, { canCut: true, canCopy: true, canPaste: true, canSelectAll: true })).toEqual([
      { role: 'cut', enabled: true },
      { role: 'copy', enabled: true },
      { role: 'paste', enabled: true },
      { role: 'selectAll', enabled: true },
    ])
  })

  it('keeps unavailable edit actions visible but disabled according to Electron flags', () => {
    expect(editContextMenuTemplate(true, { canCut: false, canCopy: false, canPaste: false, canSelectAll: true })).toEqual([
      { role: 'cut', enabled: false },
      { role: 'copy', enabled: false },
      { role: 'paste', enabled: false },
      { role: 'selectAll', enabled: true },
    ])
  })

  it('does not create a menu for non-editable targets', () => {
    expect(editContextMenuTemplate(false, { canCut: false, canCopy: false, canPaste: false, canSelectAll: false })).toBeNull()
  })

  it('opens the native menu at Electron’s requested position for editable targets', () => {
    const event = { preventDefault: vi.fn() }
    const showMenu = vi.fn()
    handleEditContextMenu(event, { x: 24, y: 52, isEditable: true, canCut: true, canCopy: true, canPaste: true, canSelectAll: true }, showMenu)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(showMenu).toHaveBeenCalledWith(editContextMenuTemplate(true, { canCut: true, canCopy: true, canPaste: true, canSelectAll: true }), 24, 52)
  })

  it('suppresses the browser menu without opening an edit menu outside editable targets', () => {
    const event = { preventDefault: vi.fn() }
    const showMenu = vi.fn()
    handleEditContextMenu(event, { x: 24, y: 52, isEditable: false, canCut: false, canCopy: false, canPaste: false, canSelectAll: false }, showMenu)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(showMenu).not.toHaveBeenCalled()
  })
})
