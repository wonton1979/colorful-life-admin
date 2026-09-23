export interface AdminCategory {
  id: number
  name: string
  subtitle: string | null
  description: string | null
  imageUrl: string | null
  imagePublicId: string | null
}

export interface CategoryTextUpdate {
  name: string
  subtitle: string | null
  description: string | null
}

export type CategoryCreate = CategoryTextUpdate

export interface AdminCategoriesApi {
  list(): Promise<AdminCategory[]>
  create(input: CategoryCreate): Promise<AdminCategory>
  update(categoryId: number, update: CategoryTextUpdate): Promise<AdminCategory>
  uploadArtwork(categoryId: number, image: { bytes: Uint8Array; filename: string; mimeType: string }): Promise<AdminCategory>
  removeArtwork(categoryId: number): Promise<AdminCategory>
}
