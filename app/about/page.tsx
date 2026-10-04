import type { Metadata } from 'next'
import SiteHeader from '@/components/SiteHeader'
import { ExternalLink } from 'lucide-react' 
import Image from 'next/image'
import Ornament from '@/components/Ornament'

export const metadata: Metadata = {
  title: 'About — Frankendiff',
  description:
    "Frankendiff is a reading tool for Mary Shelley's Frankenstein. Read the 1818 and 1831 editions and explore the differences between them.",
}

export default function AboutPage() {
  return (
    <>
      <SiteHeader />

      <main className="max-w-2xl mx-auto px-6 py-16 text-pretty">
        <h1 className="font-serif text-4xl sm:text-5xl font-medium leading-tight mt-8 mb-12 text-pretty">
          Frankendiff, a reading tool for <em>Frankenstein</em>.
        </h1>

        {/* About the project */}
        <section className="mb-16 prose-serif text-fg space-y-8">
          <p>
          Mary Shelley published <em>Frankenstein</em> in 1818 and returned to it more than a decade later, producing a substantially revised edition in 1831. The two texts differ in hundreds of small and large ways: typographical corrections, altered phrasing, and passages rewritten or expanded.
          </p>

          <p>
          <span className="font-semibold">Frankendiff</span> makes it possible to read these editions side by side in spirit, moving easily between them and seeing exactly where the text changed. A <a href="https://en.wikipedia.org/wiki/File_comparison" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 decoration-1 hover:text-muted transition-colors inline-flex items-baseline gap-1">diff view<ExternalLink size={14} className="self-center text-muted" /></a> marks every insertion and deletion inline, allowing the revisions to appear directly within the flow of the novel.
          </p>
          <p>
          The relationship between the 1818 and 1831 texts has long been studied and documented in scholarly editions. <strong className="font-semibold">Frankendiff</strong> approaches that history in a simpler way: by making the changes visible within the text itself, and freely accessible to anyone who wishes to explore them while reading.
          </p>
        </section>

        {/* The editions */}
        <section className="mb-12 prose-serif">
          <h2 className="text-3xl font-medium mb-8">The two editions</h2>

          <div className="mb-12 border border-border rounded-lg p-8 md:-mx-8">
            <h3 className="flex justify-between items-center mb-6 pb-5 border-b border-dotted border-border">
                <span className="text-3xl font-medium">1818 </span>
                <span className="font-sans text-xs tracking-widest text-muted uppercase">The original text</span>
              </h3>
            <div className="flex flex-col md:flex-row gap-10 relative items-start">
              <p className="prose-serif text-fg">
                The first edition was published anonymously in three volumes on 1 January 1818 by
                Lackington, Hughes, Harding, Mavor &amp; Jones, with a preface written by Percy
                Bysshe Shelley. It is often regarded as the more radical version of the novel:
                politically sharper, less overtly moralizing, and closer in spirit to the intellectual circle of Godwin, Wollstonecraft, and the Shelleys in which it was conceived. Mary Shelley was twenty years old when the novel first appeared.
              </p>
              <div className="mx-auto mt-2 w-full max-w-80 md:max-w-40 shrink-0 shadow-lg">
                <Image
                  src="/frankenstein-1818-cover.jpg"
                  alt="1831 edition cover"
                  width={400}
                  height={664}
                  className="w-full h-auto"
                />
              </div>
            </div>
          </div>

          <div className="mb-12 border border-border rounded-lg p-8 md:-mx-8">
            <h3 className="flex justify-between items-center mb-6 pb-5 border-b border-dotted border-border">
                <span className="text-3xl font-medium">1831 </span>
                <span className="font-sans text-xs tracking-widest text-muted uppercase">The revised edition</span>
              </h3>
            <div className="flex flex-col md:flex-row gap-10 relative items-start">
              <p>
              The 1831 edition was published as part of Bentley’s <em>Standard Novels</em> series.
              Shelley revised the text extensively: she softened some of the more provocative passages,
              expanded Victor Frankenstein’s childhood and backstory, and shifted the
              novel’s framing toward a more fatalistic, providential tone. She also added a
              new author’s introduction — now almost as famous as the novel itself — describing
              how she came to write the story during the &ldquo;wet, ungenial summer&rdquo; of 1816
              at the Villa Diodati.
              </p>
              <div className="mx-auto mt-2 w-full max-w-80 md:max-w-40 shrink-0 shadow-lg">
                <Image
                  src="/frankenstein-1831-cover.jpg"
                  alt="1831 edition cover"
                  width={400}
                  height={664}
                  className="w-full h-auto"
                />
              </div>
            </div>
          </div>
        </section>

        {/* The 1823 edition */}
        <section className="prose-serif mb-12 pt-10 space-y-8">
          <h2 className="text-3xl font-medium mb-6">What about the 1823 edition?</h2>
          <p>
            A second edition was published in two volumes in 1823 by G. and W.B. Whittaker.
            It has one notable distinction: it was the first edition to carry Shelley’s
            name on the title page, rather than the 1818 printing’s anonymous attribution.
          </p>
          <p>
            Beyond that, the 1823 edition introduced relatively few changes, mainly
            correcting typographical errors and some minor stylistic inconsistencies in the
            1818 text. It does not represent a significant editorial intervention in the way
            the 1831 revision does. For that reason it is not included in this project:
            the story worth telling is the contrast between the raw 1818 first
            edition and the heavily revised 1831 text.
          </p>
        </section>

        <Ornament className="my-20 w-full justify-center" ruleWidth="w-32"/>

        {/* Author */}
        <section className="mb-12 prose-serif text-fg space-y-8">
          <h2 className="font-serif text-3xl font-medium mb-6">Who made this?</h2>


          <p>
          <strong className="font-semibold">Frankendiff</strong> is a personal project by <span className="text-nowrap"><a href="https://www.linkedin.com/in/evilluendas/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 decoration-1 hover:text-muted transition-colors inline-flex items-baseline gap-1">Eduardo Villuendas <ExternalLink size={14} className="self-center text-muted" /></a>,</span> built mostly for fun. It started after I realized how surprisingly difficult it can be to tell which version of <em>Frankenstein</em> one is reading. Many editions quietly follow the 1831 text, while others reproduce the 1818 version, and the differences between them are not always easy to spot.
          </p>
          <p>
          I thought it might be useful to make those changes easier to see while reading, so I put this site together.
          </p>

          <p>
          <strong className="font-semibold">Frankendiff</strong> is not affiliated with any institution.
          </p>

          <p>
          If you notice an error in the text, a misaligned paragraph, or anything else worth fixing —or if you simply have something to share— you are welcome to write to{' '}
          {/* Email encoded as HTML entities — browsers decode them, most address harvesters do not */}
          <span dangerouslySetInnerHTML={{__html: '<a href="&#109;&#97;&#105;&#108;&#116;&#111;&#58;&#104;&#101;&#108;&#108;&#111;&#64;&#102;&#114;&#97;&#110;&#107;&#101;&#110;&#100;&#105;&#102;&#102;&#46;&#99;&#111;&#109;" class="underline underline-offset-4 decoration-1 hover:text-muted transition-colors">&#104;&#101;&#108;&#108;&#111;&#64;&#102;&#114;&#97;&#110;&#107;&#101;&#110;&#100;&#105;&#102;&#102;&#46;&#99;&#111;&#109;</a>'}} />.
          </p>

          <p>
          The code is open source. You can browse it, report a problem, or propose a fix on{' '}
          <span className="text-nowrap"><a href="https://github.com/evilluendas/frankendiff" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 decoration-1 hover:text-muted transition-colors inline-flex items-baseline gap-1">GitHub <ExternalLink size={14} className="self-center text-muted" /></a></span>.
          </p>


        </section>

        {/* Sources */}
        <section className="mb-12 mt-30 prose-serif text-fg space-y-8">
          <h2 className="font-serif text-3xl font-medium mb-6">Sources</h2>
          <p>All texts and images used in this project are in the public domain.</p>
          <ul className="space-y-6 font-sans text-base">
            <li className="flex flex-col gap-0.5 items-start">
              <span className="text-xs tracking-widest uppercase text-muted">1818 — transcription</span>
              <a href="https://en.wikisource.org/wiki/Frankenstein,_or_the_Modern_Prometheus_(First_Edition,_1818)" target="_blank" rel="noopener noreferrer" className="items-baseline underline underline-offset-4 decoration-1 hover:text-muted transition-colors">
                Wikisource — <em>Frankenstein, or the Modern Prometheus</em>, (First Edition, 1818)<ExternalLink size={12} className="self-baseline inline-block text-muted shrink-0 ml-1" />
              </a>
            </li>
            <li className="flex flex-col gap-0.5 items-start">
              <span className="text-xs tracking-widest uppercase text-muted">1818 — facsimile, volume I</span>
              <a href="https://archive.org/details/maryshelleyfrankenstein1/" target="_blank" rel="noopener noreferrer" className="items-baseline underline underline-offset-4 decoration-1 hover:text-muted transition-colors">
                Internet Archive — <em>Frankenstein</em>, 1818, vol. I<ExternalLink size={12} className="self-baseline inline-block text-muted shrink-0 ml-1" />
              </a>
            </li>
            <li className="flex flex-col gap-0.5 items-start">
              <span className="text-xs tracking-widest uppercase text-muted">1818 — facsimile, volume II</span>
              <a href="https://archive.org/details/maryshelleyfrankenstein2" target="_blank" rel="noopener noreferrer" className="items-baseline underline underline-offset-4 decoration-1 hover:text-muted transition-colors">
                Internet Archive — <em>Frankenstein</em>, 1818, vol. II<ExternalLink size={12} className="self-baseline inline-block text-muted shrink-0 ml-1" />
              </a>
            </li>
            <li className="flex flex-col gap-0.5 items-start">
              <span className="text-xs tracking-widest uppercase text-muted">1818 — facsimile, volume III</span>
              <a href="https://archive.org/details/maryshelleyfrankenstein3" target="_blank" rel="noopener noreferrer" className="items-baseline underline underline-offset-4 decoration-1 hover:text-muted transition-colors">
                Internet Archive — <em>Frankenstein</em>, 1818, vol. III<ExternalLink size={12} className="self-baseline inline-block text-muted shrink-0 ml-1" />
              </a>
            </li>
            <li className="flex flex-col gap-0.5 items-start">
              <span className="text-xs tracking-widest uppercase text-muted">1831 — transcription</span>
              <a href="https://en.wikisource.org/wiki/Frankenstein,_or_the_Modern_Prometheus_(Revised_Edition,_1831)" target="_blank" rel="noopener noreferrer" className="items-baseline underline underline-offset-4 decoration-1 hover:text-muted transition-colors">
                Wikisource — <em>Frankenstein, or the Modern Prometheus</em>, (Revised Edition, 1831)<ExternalLink size={12} className="self-baseline inline-block text-muted shrink-0 ml-1" />
              </a>
            </li>
            <li className="flex flex-col gap-0.5 items-start">
              <span className="text-xs tracking-widest uppercase text-muted">1831 — facsimile</span>
              <a href="https://archive.org/details/ghostseer01schiuoft" target="_blank" rel="noopener noreferrer" className="items-baseline underline underline-offset-4 decoration-1 hover:text-muted transition-colors">
                Internet Archive — <em>Frankenstein</em>, 1831<ExternalLink size={12} className="self-baseline inline-block text-muted shrink-0 ml-1" />
              </a>
            </li>
            <li className="flex flex-col gap-0.5 items-start">
              <span className="text-xs tracking-widest uppercase text-muted">1831 — front matter illustrations</span>
              <a href="https://pdimagearchive.org/images/c5ada3da-7250-4580-a8d7-b22c029de210/" target="_blank" rel="noopener noreferrer" className="items-baseline underline underline-offset-4 decoration-1 hover:text-muted transition-colors">
                Public Domain Image Archive — <em>Frankenstein</em>, 1831 front matter illustration<ExternalLink size={12} className="self-baseline inline-block text-muted shrink-0 ml-1" />
              </a>
            </li>
          </ul>
        </section>
        <section className="prose-serif text-right text-fg mt-80 mb-8 space-y-8">
          <p>Thank you for your time! <br />
            <span className="text-muted italic">— New York City, March 2026</span>
          </p>
        </section>
      </main>
    </>
  )
}
