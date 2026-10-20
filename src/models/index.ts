/**
 * Model nghiệp vụ. Đề yêu cầu 2 model chính: DishCategory và Dish.
 * DishImage là thành phần của Dish (Dish.images), không phải đối tượng
 * quản lý độc lập; được lưu thành bảng riêng trong SQLite để dễ ràng buộc
 * "tối đa 1 thumbnail" và nhúng thành mảng khi gửi lên MockAPI.
 */
import type { SyncStatus } from '@/database/schema';

export interface DishCategory {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  syncStatus: SyncStatus;
}

export interface DishImage {
  id: string;
  dishId: string;
  imageUrl: string;
  isThumbnail: boolean;
  sortOrder: number;
}

export interface Dish {
  id: string;
  name: string;
  description: string;
  price: number;
  /** Thời gian chế biến, đơn vị phút (số nguyên dương). */
  preparationTime: number;
  isAvailable: boolean;
  dishCategoryId: string;
  images: DishImage[];
  createdAt: number;
  updatedAt: number;
  syncStatus: SyncStatus;
}

/** Dòng hiển thị ở danh sách: món + tên danh mục + url thumbnail. */
export interface DishListItem extends Omit<Dish, 'images'> {
  categoryName: string;
  thumbnailUrl: string | null;
  imageCount: number;
}

export interface DishDetail extends Dish {
  categoryName: string;
}

export interface CategoryWithCount extends DishCategory {
  dishCount: number;
}

/** Dữ liệu thô từ form (chuỗi), service sẽ parse + validate. */
export interface DishFormInput {
  name: string;
  description: string;
  price: string;
  preparationTime: string;
  isAvailable: boolean;
  dishCategoryId: string;
  images: { id?: string; imageUrl: string; isThumbnail: boolean }[];
}

export interface CategoryFormInput {
  name: string;
  description: string;
}

export type SpeedLabel = 'quick' | 'regular';
