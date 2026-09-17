import type { SignupInput, SignupResponse } from '@/actions/signup-actions'

function responseError(status: number): SignupResponse {
    let message = 'Máy chủ trả về phản hồi không hợp lệ. Vui lòng tải lại trang rồi thử lại.'
    if (status === 403) {
        message = 'Yêu cầu đăng ký bị chặn. Vui lòng tải lại trang rồi thử lại.'
    } else if (status === 429) {
        message = 'Quá nhiều yêu cầu đăng ký. Vui lòng thử lại sau ít phút.'
    } else if (status >= 500) {
        message = 'Dịch vụ đăng ký đang tạm thời gặp sự cố. Vui lòng thử lại sau ít phút.'
    }
    return { success: false, message }
}

export async function submitSignup(input: SignupInput): Promise<SignupResponse> {
    let response: Response
    try {
        response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        })
    } catch {
        // A failed client-side request (including a failed BotID script) does
        // not prove the server is offline. Never log the signup credentials.
        return {
            success: false,
            message: 'Không thể gửi yêu cầu đăng ký. Vui lòng tải lại trang hoặc kiểm tra kết nối mạng rồi thử lại.',
        }
    }

    // Proxies can return HTML/empty 502/504 responses. Keep those separate
    // from fetch failures instead of presenting every JSON error as offline.
    const data: unknown = await response.json().catch(() => null)
    if (!data || typeof data !== 'object' || !('success' in data)) {
        return responseError(response.status)
    }
    if (response.ok && data.success === true) return { success: true }
    if (data.success !== false) return responseError(response.status)

    if ('errors' in data && data.errors && typeof data.errors === 'object') {
        const errors = Object.fromEntries(
            Object.entries(data.errors).filter((entry): entry is [string, string] =>
                typeof entry[1] === 'string' && entry[1].length > 0),
        )
        if (Object.keys(errors).length > 0) return { success: false, errors }
    }
    if ('message' in data && typeof data.message === 'string' && data.message) {
        return { success: false, message: data.message }
    }
    return responseError(response.status)
}
