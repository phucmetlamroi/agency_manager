// [P2-D3] Default for the @modal parallel-route slot. Next.js requires a default
// so that routes NOT matching the intercepting slot (i.e. every normal page, and
// hard refreshes) render nothing in the modal slot instead of 404-ing.
export default function ModalDefault() {
    return null
}
