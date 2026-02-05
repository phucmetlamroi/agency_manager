/**
 * Translates technical error codes (Prisma, Server) into user-friendly Vietnamese messages.
 * This acts as the "Translation Layer" specified in the UX Risk Report.
 */

type ErrorCode = string

const ERROR_MAP: Record<ErrorCode, string> = {
    // Prisma Errors
    'P2002': 'Dữ liệu này đã tồn tại trong hệ thống (Duplicate). Vui lòng kiểm tra lại.',
    'P2025': 'Không tìm thấy dữ liệu yêu cầu. Có thể đã bị xóa.',
    'P2003': 'Dữ liệu liên quan không hợp lệ (Foreign Key Failed).',

    // Auth Errors
    'AUTH_001': 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',
    'AUTH_002': 'Bạn không có quyền thực hiện thao tác này.',

    // Generic
    'NETWORK_ERROR': 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng.',
    'UNKNOWN': 'Đã xảy ra lỗi không xác định. Vui lòng thử lại sau.'
}

export function translateError(error: any): string {
    if (typeof error === 'string') {
        // Try to match partial codes
        for (const [code, msg] of Object.entries(ERROR_MAP)) {
            if (error.includes(code)) return msg
        }
        return error // Return original if no match
    }

    if (error?.code && ERROR_MAP[error.code]) {
        return ERROR_MAP[error.code]
    }

    if (error?.message) {
        for (const [code, msg] of Object.entries(ERROR_MAP)) {
            if (error.message.includes(code)) return msg
        }
    }

    return ERROR_MAP['UNKNOWN']
}
