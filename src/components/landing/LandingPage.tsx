import './landing.css'
import { LangProvider } from './i18n'
import { LandingNav } from './LandingNav'
import { Hero } from './Hero'
import { VeloxSpotlight } from './VeloxSpotlight'
import { BentoPlatform } from './BentoPlatform'
import { HowItWorks } from './HowItWorks'
import { StatsBand } from './StatsBand'
import { FinalCTA } from './FinalCTA'
import { LandingFooter } from './LandingFooter'

/**
 * HustlyTasker public marketing landing page (Direction B · Apple Dark Glass).
 * Ported pixel-faithfully from the Claude Design handoff; all styles are scoped
 * under `.htl` (see landing.css) so they never touch the in-app design system.
 */
export default function LandingPage() {
    return (
        <LangProvider>
            <div className="htl">
                {/* Atmosphere */}
                <div className="atmosphere" aria-hidden="true">
                    <div className="blob b1" />
                    <div className="blob b2" />
                    <div className="blob b3" />
                    <div className="blob b4" />
                    <div className="grid-overlay" />
                </div>
                <div className="grain" aria-hidden="true" />

                <div className="shell">
                    <LandingNav />
                    <Hero />
                    <VeloxSpotlight />
                    <BentoPlatform />
                    <HowItWorks />
                    <StatsBand />
                    <FinalCTA />
                    <LandingFooter />
                </div>
            </div>
        </LangProvider>
    )
}
