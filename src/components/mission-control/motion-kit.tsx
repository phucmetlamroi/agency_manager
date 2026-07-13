'use client'

// [Giao diện 2 · Mission Control] Shared MOTION KIT — one cohesive micro-interaction language
// for the whole cockpit (hover-lift, spring press, staggered mount reveals). PRESENTATIONAL ONLY:
// every primitive forwards all props (onClick/href/type/disabled/style…) so no handler/logic is
// affected. Respects the OS "reduce motion" setting via Framer useReducedMotion — when on, all
// transforms are disabled and content simply appears. Import from './motion-kit'. Never used by
// Giao diện 1 (only MC components import it) → /admin stays byte-identical.
import { motion, useReducedMotion, type MotionProps } from 'framer-motion'
import { forwardRef } from 'react'

// Snappy-but-soft springs — the signature feel. `mcSpring` = interactive (press/hover);
// `mcSpringSoft` = mount reveals.
export const mcSpring = { type: 'spring', stiffness: 420, damping: 30, mass: 0.6 } as const
export const mcSpringSoft = { type: 'spring', stiffness: 240, damping: 22 } as const

type AnyMotion = MotionProps & {
    style?: React.CSSProperties
    className?: string
    children?: React.ReactNode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
}

type PressAs = 'button' | 'div' | 'span'

/**
 * Pressable — buttons, pills, clickable icons. Lifts + brightens on hover, springs down on tap.
 * IMPORTANT: inside a Next <Link> (which renders an <a>), use `as="div"` or `as="span"` — never
 * `as="button"` (an <a> cannot contain a <button>). All props are forwarded verbatim.
 */
export const Pressable = forwardRef<HTMLElement, AnyMotion & { as?: PressAs }>(
    function Pressable({ as = 'button', children, ...rest }, ref) {
        const reduce = useReducedMotion()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Comp = (motion as any)[as]
        return (
            <Comp
                ref={ref}
                whileHover={reduce ? undefined : { scale: 1.04, y: -1 }}
                whileTap={reduce ? undefined : { scale: 0.95 }}
                transition={mcSpring}
                {...rest}
            >
                {children}
            </Comp>
        )
    },
)

/** HoverCard — cards / list rows that lift on hover. Pass `whileHover` to override the default lift. */
export function HoverCard({ children, whileHover, ...rest }: AnyMotion) {
    const reduce = useReducedMotion()
    return (
        <motion.div
            whileHover={reduce ? undefined : (whileHover ?? { y: -4 })}
            whileTap={reduce ? undefined : { scale: 0.995 }}
            transition={mcSpring}
            {...rest}
        >
            {children}
        </motion.div>
    )
}

/** Reveal — a single section fades + rises on mount. Use `delay` to sequence a few sections. */
export function Reveal({ children, delay = 0, ...rest }: AnyMotion & { delay?: number }) {
    const reduce = useReducedMotion()
    return (
        <motion.div
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...mcSpringSoft, delay }}
            {...rest}
        >
            {children}
        </motion.div>
    )
}

// Staggered list/grid: wrap the container in <RevealGroup>, each child in <RevealItem>.
const groupVariants = { hidden: {}, show: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } } }
const itemVariants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: mcSpringSoft } }

export function RevealGroup({ children, ...rest }: AnyMotion) {
    const reduce = useReducedMotion()
    return (
        <motion.div initial={reduce ? false : 'hidden'} animate="show" variants={groupVariants} {...rest}>
            {children}
        </motion.div>
    )
}

/** RevealItem — a staggered child. Pass `whileHover` (e.g. {y:-4}) to also lift the card on hover. */
export function RevealItem({ children, whileHover, ...rest }: AnyMotion) {
    const reduce = useReducedMotion()
    return (
        <motion.div
            variants={itemVariants}
            whileHover={reduce ? undefined : whileHover}
            whileTap={whileHover && !reduce ? { scale: 0.995 } : undefined}
            transition={mcSpring}
            {...rest}
        >
            {children}
        </motion.div>
    )
}
