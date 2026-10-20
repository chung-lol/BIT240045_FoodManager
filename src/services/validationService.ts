import { BUSINESS_RULES } from '@/config/appConfig';
import type { TranslationKey, TranslationParams } from '@/i18n';
import type { CategoryFormInput, DishFormInput } from '@/models';
import { cleanText, isHttpUrl, parseIntStrict, parseMoney } from '@/utils/text';

/** Lỗi lưu dạng KEY + tham số, để giao diện dịch theo ngôn ngữ hiện tại. */
export interface ErrorMessage {
  key: TranslationKey;
  params?: TranslationParams;
}

export type DishField = 'name' | 'description' | 'price' | 'preparationTime' | 'dishCategoryId' | 'images';
export type CategoryField = 'name' | 'description';

export class ValidationError<F extends string = string> extends Error {
  constructor(public readonly fields: Partial<Record<F, ErrorMessage>>) {
    super('ValidationError');
    this.name = 'ValidationError';
  }
}

/** Dữ liệu món sau khi đã parse/làm sạch (sẵn sàng ghi DB). */
export interface CleanDishInput {
  name: string;
  description: string;
  price: number;
  preparationTime: number;
  isAvailable: boolean;
  dishCategoryId: string;
  images: { id?: string; imageUrl: string; isThumbnail: boolean }[];
}

/**
 * Kiểm tra các ràng buộc KHÔNG cần database (thuần, dễ unit test).
 * Ràng buộc cần DB (danh mục tồn tại, trùng tên) nằm ở dishService.
 */
export function validateDishShape(input: DishFormInput): {
  errors: Partial<Record<DishField, ErrorMessage>>;
  value: CleanDishInput;
} {
  const errors: Partial<Record<DishField, ErrorMessage>> = {};
  const R = BUSINESS_RULES;

  const name = cleanText(input.name);
  if (!name) errors.name = { key: 'nameRequired' };
  else if (name.length > R.nameMaxLength) errors.name = { key: 'nameTooLong', params: { max: R.nameMaxLength } };

  const description = input.description.trim();
  if (description.length > R.descriptionMaxLength)
    errors.description = { key: 'descriptionTooLong', params: { max: R.descriptionMaxLength } };

  const price = parseMoney(input.price);
  if (input.price.trim() === '') errors.price = { key: 'priceRequired' };
  else if (/^-/.test(input.price.trim())) errors.price = { key: 'pricePositive' };
  else if (Number.isNaN(price)) errors.price = { key: 'priceInvalid' };
  else if (price <= 0) errors.price = { key: 'pricePositive' };
  else if (price > R.maxPrice) errors.price = { key: 'priceTooLarge' };

  const time = parseIntStrict(input.preparationTime);
  if (input.preparationTime.trim() === '') errors.preparationTime = { key: 'timeRequired' };
  else if (/^-/.test(input.preparationTime.trim())) errors.preparationTime = { key: 'timePositive' };
  else if (Number.isNaN(time)) errors.preparationTime = { key: 'timeInvalid' };
  else if (time <= 0) errors.preparationTime = { key: 'timePositive' };
  else if (time > R.maxPreparationMinutes)
    errors.preparationTime = { key: 'timeTooLarge', params: { max: R.maxPreparationMinutes } };

  if (!input.dishCategoryId) errors.dishCategoryId = { key: 'categoryRequired' };

  const images = input.images.map((img) => ({ ...img, imageUrl: img.imageUrl.trim() }));
  const seen = new Set<string>();
  for (const img of images) {
    if (!isHttpUrl(img.imageUrl)) {
      errors.images = { key: 'imageUrlInvalid' };
      break;
    }
    const k = img.imageUrl.toLowerCase();
    if (seen.has(k)) {
      errors.images = { key: 'imageUrlDuplicate' };
      break;
    }
    seen.add(k);
  }
  if (!errors.images && images.length > R.maxImagesPerDish)
    errors.images = { key: 'tooManyImages', params: { max: R.maxImagesPerDish } };
  if (!errors.images && images.filter((i) => i.isThumbnail).length > 1)
    errors.images = { key: 'multipleThumbnails' };

  return {
    errors,
    value: {
      name,
      description,
      price,
      preparationTime: time,
      isAvailable: input.isAvailable,
      dishCategoryId: input.dishCategoryId,
      images,
    },
  };
}

export function validateCategoryShape(input: CategoryFormInput) {
  const errors: Partial<Record<CategoryField, ErrorMessage>> = {};
  const name = cleanText(input.name);
  if (!name) errors.name = { key: 'nameRequired' };
  else if (name.length > BUSINESS_RULES.nameMaxLength)
    errors.name = { key: 'nameTooLong', params: { max: BUSINESS_RULES.nameMaxLength } };
  const description = input.description.trim();
  if (description.length > BUSINESS_RULES.descriptionMaxLength)
    errors.description = { key: 'descriptionTooLong', params: { max: BUSINESS_RULES.descriptionMaxLength } };
  return { errors, value: { name, description } };
}

export const hasErrors = (e: object) => Object.keys(e).length > 0;
