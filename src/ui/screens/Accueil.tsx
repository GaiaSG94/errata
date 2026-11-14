import { Bouton } from '../components/Bouton'
import { BandeauSante } from '../components/BandeauSante'
import { Carte } from '../components/Carte'
import { COPIES_DEMO, ID_COPIES_DEMO } from '../../pipeline/demo'
import { useRature } from '../../etat/useRature'

const STEPS = [
  ['1', 'Normalize', 'deskew'],
  ['2', 'Mask name', 'private'],
  ['3', 'Read marks', 'vision'],
  ['4', 'Classify E01', 'taxonomy'],
  ['5', 'Aggregate', 'local'],
  ['6', 'Build drill', 'guarded'],
] as const

function CopyCard() {
  return (
    <div className="errata-journey-card errata-copy-card">
      <div className="errata-card-bar"><span>Paper 2 · 10B · name hidden</span><span>photo</span></div>
      <div className="errata-handwriting">
        <span className="errata-question">(1) Expand (x + 5)²</span>
        <span>= x² + 10x <span className="errata-mark">− 25</span></span>
        <span className="sticker sticker-ambre errata-error-sticker">E01 · sign lost · 3rd time</span>
      </div>
    </div>
  )
}

function DiagnosisCard() {
  return (
    <div className="errata-journey-card errata-diagnosis-card">
      <span className="errata-step-label">2 · Errata finds</span>
      <strong>E01</strong>
      <h2>Sign lost</h2>
      <p>Present in 3 of your last 3 papers.</p>
      <span className="sticker sticker-ambre">Recurring error</span>
    </div>
  )
}

function DrillCard() {
  return (
    <div className="errata-journey-card errata-drill-card">
      <span className="errata-step-label">3 · You practise</span>
      <span className="errata-drill-question">Expand (x <b>− 4</b>)²</span>
      <p>One targeted drill for one recurring gesture.</p>
      <span className="sticker sticker-menthe">Relevance guard ✓</span>
    </div>
  )
}

export function Accueil() {
  const { aller, profil, analyserDemo, occupe } = useRature()
  const plusieurs = ID_COPIES_DEMO.length > 1

  return (
    <div className="errata-home">
      <section className="errata-hero">
        <div className="errata-hero-copy">
          <p className="errata-hero-kicker">A study app for students who hate red pen.</p>
          <h1>Turn your mistakes into <span className="mot-italique">moves</span></h1>
          <p className="errata-hero-lede">
            Photograph your corrected paper. We read the teacher&apos;s marks, sort them by error type,
            and build the exercise that works on <em>your</em> weakness.
          </p>
          <div className="errata-hero-actions">
            <Bouton onClick={() => aller('cadrage')}>Photograph my paper</Bouton>
            <Bouton variante="secondaire" onClick={() => void analyserDemo()} disabled={occupe}>Try the demo <span>↗</span></Bouton>
          </div>
          <div className="errata-proof-stickers" aria-hidden="true">
            <span className="sticker sticker-rose">No grades. Ever.</span>
            <span className="sticker sticker-blanc">12 error types</span>
          </div>
        </div>

        <div className="errata-journey" aria-label="How Errata works">
          <div className="errata-journey-heading"><span>How Errata works</span><span>paper → practice</span></div>
          <div className="errata-journey-flow">
            <CopyCard />
            <span className="errata-journey-arrow" aria-hidden="true">→</span>
            <DiagnosisCard />
            <span className="errata-journey-arrow" aria-hidden="true">→</span>
            <DrillCard />
          </div>
          <div className="errata-steps" aria-label="Six analysis steps">
            {STEPS.map(([number, label, meta]) => (
              <div className={number === '4' ? 'errata-pipeline-step is-hot' : 'errata-pipeline-step'} key={number}>
                <span>{number}</span><strong>{label}</strong><small>{meta}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="errata-home-lower">
        <BandeauSante />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-white/90">No paper is ever stored. Your history stays on your device.</p>
          <div className="flex flex-wrap gap-2">
            <Bouton variante="discret" onClick={() => void analyserDemo()} disabled={occupe}>Run the demo</Bouton>
            {plusieurs ? <Bouton variante="discret" onClick={() => void analyserDemo(ID_COPIES_DEMO)} disabled={occupe}>Full demo ({ID_COPIES_DEMO.length} papers)</Bouton> : null}
          </div>
        </div>
        <p className="text-center text-xs text-white/75">Model answers recorded on {COPIES_DEMO.length} sample paper(s) · no network call · no key.</p>
        {profil.totalAnalyses > 0 ? (
          <Carte titre="Continue" ton="vert">
            <p className="text-sm text-muet">{profil.totalAnalyses} paper(s) analysed on this device.</p>
            <div className="mt-3"><Bouton variante="secondaire" onClick={() => aller('profil')}>See my error profile</Bouton></div>
          </Carte>
        ) : null}
      </div>
    </div>
  )
}
