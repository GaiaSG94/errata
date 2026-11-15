/**
 * Enregistreur du corpus de démo — capte les vraies réponses du modèle sur
 * plusieurs copies du corpus et les écrit dans `corpus/reponses/`.
 *
 * Pourquoi : la démo publique n'a pas de clé, et l'amont peut être lent ou sans
 * capacité le jour du jugement. Le produit rejoue ces réponses — c'est le
 * « cache des réponses sur le corpus de démo » prévu au tableau des risques
 * (§24). Tout est rejoué **brut** : les parseurs zod travaillent pour de vrai.
 *
 * Trois copies sont enregistrées pour que TOUTES les fonctions du produit soient
 * visibles hors ligne : deux types d'erreur différents (profil + trajectoire) et
 * une copie puissances (mode prof, statistique de classe).
 *
 * Ignoré sans clé. Lancement :
 *   INFERHUB_API_KEY=… npx vitest run tests/live/enregistrer-demo.test.ts
 *
 * ⚠ Toute modification de la structure des appels (fusion, seconde passe,
 * garde-fou) impose de **recapturer** ce corpus : sinon la démo rejoue un ancien
 * format et le parseur renvoie tout en E99 (bug du 11/11, voir tests/demo.test.ts).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { construireDiagnostic } from '../../src/domain/diagnostic'
import { MODELE_PAR_DEFAUT } from '../../src/domain/config'
import { analyserImage } from '../../src/pipeline/analyse'
import type { ClientBrut } from '../../src/pipeline/client'
import { genererExerciceVerifie } from '../../src/pipeline/exercise'
import { revoirFautesPeuSures } from '../../src/pipeline/revue'
import type { RequeteLLM, Transport } from '../../src/pipeline/llm'
import { chaineModeles, construireCorps } from '../../src/pipeline/llm'

const CLE = process.env.INFERHUB_API_KEY ?? ''
const AMONT = process.env.RATURE_AMONT ?? 'https://api.inferhub.dev/v1'
const DELAI_MS = 240_000
const transport: Transport = { proxy: `${AMONT}/chat/completions` }

/**
 * Copies enregistrées pour la démo : elles sont lues dans `corpus/demo/` (les
 * « photos » de l'élève), et chacune donne un fichier de réponses de même nom.
 */
const DOSSIER_DEMO = '../../corpus/demo'
/** Toutes les copies photo de la démo (cf. corpus/copies-demo.json). */
const COPIES_DEMO = [
  'copie-demo-1.jpg',
  'copie-demo-2.jpg',
  'copie-demo-3.jpg',
  'copie-demo-4.jpg',
  'copie-demo-5.jpg',
  'copie-demo-6.jpg',
]

async function appeler(requete: RequeteLLM, modele: string): Promise<string> {
  const reponse = await fetch(`${AMONT}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${CLE}` },
    body: JSON.stringify(construireCorps(requete, modele)),
    signal: AbortSignal.timeout(DELAI_MS),
  })
  if (!reponse.ok) {
    throw Object.assign(new Error(`amont HTTP ${reponse.status}`), { statut: reponse.status })
  }
  const data = (await reponse.json()) as { choices?: { message?: { content?: string } }[] }
  return data.choices?.[0]?.message?.content ?? ''
}

const TRANSITOIRES = new Set([402, 429, 500, 502, 503, 504])

/** Client réel avec repli sur la chaîne, qui enregistre chaque réponse brute. */
function clientEnregistreur(brut: Record<string, string[]>, cle: string): ClientBrut {
  return async (requete: RequeteLLM) => {
    let derniere = 'aucun modèle disponible'
    for (const modele of chaineModeles(transport)) {
      try {
        const texte = await appeler(requete, modele)
        brut[cle] = [...(brut[cle] ?? []), texte]
        return texte
      } catch (erreur) {
        if (!TRANSITOIRES.has((erreur as { statut?: number }).statut ?? 0)) throw erreur
        derniere = (erreur as Error).message
      }
    }
    throw new Error(derniere)
  }
}

function imageDataUrl(nom: string): string {
  const chemin = fileURLToPath(new URL(`${DOSSIER_DEMO}/${nom}`, import.meta.url))
  const octets = readFileSync(chemin)
  const type = nom.endsWith('.jpg') ? 'image/jpeg' : 'image/png'
  return `data:${type};base64,${octets.toString('base64')}`
}

function cheminSortie(nom: string): string {
  const base = nom.replace(/\.(png|jpg)$/, '.json')
  return fileURLToPath(new URL(`../../corpus/reponses/${base}`, import.meta.url))
}

/** Enchaîne le chemin réel du produit sur une copie et écrit les réponses. */
async function enregistrer(nom: string) {
  const brut: Record<string, string[]> = {}
  // Les durées réelles de chaque étape sont capturées : la démo rejouera ce
  // rythme-là, au lieu d'être instantanée (et donc invraisemblable).
  const durees: Record<string, number> = {}
  const chrono = async <T>(etape: string, travail: () => Promise<T>): Promise<T> => {
    const debut = Date.now()
    const resultat = await travail()
    durees[etape] = Date.now() - debut
    return resultat
  }
  const { extraction, erreurs } = await chrono('extrait', () =>
    analyserImage(imageDataUrl(nom), transport, clientEnregistreur(brut, 'analyse')),
  )
  const revue = await chrono('classifie', () =>
    revoirFautesPeuSures(erreurs, transport, clientEnregistreur(brut, 'revue')),
  )
  const diagnostic = construireDiagnostic(revue.erreurs, { id: nom, createdAt: new Date().toISOString() })
  // Une copie sans faute n'a pas de type dominant : c'est un résultat
  // attendu (« aucune erreur détectée »), pas un échec d'enregistrement.
  const propre = extraction.copiePropre
  if (!propre) expect(diagnostic.typeDominant, `${nom} : aucun type dominant`).toBeTruthy()

  if (!propre) {
    await chrono('genere', () =>
      genererExerciceVerifie({
        typeDominant: diagnostic.typeDominant!,
        extraitCopie: extraction.annotations.map((a) => a.ligne).slice(0, 6).join('\n'),
        transport,
        client: async (requete: RequeteLLM) => {
          const cle = requete.system.includes('Garde-fou') || requete.system.includes('Relevance guardrail') ? 'verdict' : 'exercice'
          return clientEnregistreur(brut, cle)(requete)
        },
      }),
    )
  }

  mkdirSync(fileURLToPath(new URL('../../corpus/reponses/', import.meta.url)), { recursive: true })
  writeFileSync(
    cheminSortie(nom),
    `${JSON.stringify(
      {
        source: `corpus/demo/${nom}`,
        modele: MODELE_PAR_DEFAUT,
        enregistreLe: new Date().toISOString(),
        dominant: propre ? 'propre' : diagnostic.typeDominant,
        nbFautes: propre ? 0 : diagnostic.nbFautes,
        revues: revue.revues,
        durees,
        // Dernière réponse de chaque étape, pas la première : le garde-fou peut
        // refuser un exercice et le pipeline en régénère un second. Rejouer la
        // première réponse rejouerait un refus, alors que le produit a bien
        // servi la seconde. Pour les étapes appelées une seule fois, c'est
        // identique.
        reponses: Object.fromEntries(
          Object.entries(brut).map(([cle, liste]) => [cle, liste[liste.length - 1]]),
        ),
      },
      null,
      2,
    )}\n`,
  )
  return { nom, dominant: propre ? 'propre' : diagnostic.typeDominant, revues: revue.revues }
}

describe.skipIf(!CLE)('enregistrement du corpus de démo', () => {
  for (const nom of COPIES_DEMO) {
    it(
      `capte analyse, revue, exercice et verdict sur ${nom}`,
      async () => {
        const resultat = await enregistrer(nom)
        console.info(`[démo] ${resultat.nom} → dominant ${resultat.dominant}, revues ${resultat.revues}`)
        const contenu = JSON.parse(readFileSync(cheminSortie(nom), 'utf8')) as {
          dominant: string
          reponses: Record<string, string>
        }
        expect(contenu.reponses.analyse).toBeTruthy()
        // Une copie propre n'a ni exercice ni verdict : le pipeline s'arrête
        // avant, et c'est le résultat attendu (« aucune erreur détectée »).
        if (contenu.dominant === 'propre') {
          expect(contenu.reponses.exercice).toBeUndefined()
          return
        }
        expect(contenu.reponses.exercice).toBeTruthy()
        expect(contenu.reponses.verdict).toBeTruthy()
      },
      DELAI_MS * 8,
    )
  }
})