// [Giải trí] Định dạng mã truy cập — hàm THUẦN, không I/O, không Prisma.
//
// Tách khỏi codes.ts có chủ đích: màn nhập mã là client component, mà codes.ts
// import prisma + nanoid. Import chéo sẽ kéo cả Prisma vào bundle trình duyệt.

/** Chia 4 cho dễ đọc/đọc qua điện thoại: XXXX-XXXX-XXXX-XXXX */
export function formatEntCode(code: string): string {
    return code.replace(/(.{4})(?=.)/g, '$1-')
}

/** Chuẩn hoá thứ người dùng gõ: bỏ gạch/khoảng trắng, viết hoa. */
export function normalizeEntCode(input: string): string {
    return input.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}
