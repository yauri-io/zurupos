import { Type } from 'typebox'
import { Body, Name, Sort, Uuid } from '../../http/schemas.js'

export const CategoryResponse = Type.Object({
  id: Uuid,
  name: Type.String(),
  sort: Type.Integer(),
  is_active: Type.Boolean(),
})

export const CategoryListResponse = Type.Object({ categories: Type.Array(CategoryResponse) })

export const CreateCategoryBody = Body({
  name: Name(60),
  sort: Type.Optional(Sort),
  is_active: Type.Optional(Type.Boolean()),
})

export const UpdateCategoryBody = Body({
  name: Type.Optional(Name(60)),
  sort: Type.Optional(Sort),
  is_active: Type.Optional(Type.Boolean()),
})
