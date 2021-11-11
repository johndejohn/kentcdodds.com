import React, {useState} from 'react'
import type {HeadersFunction, MetaFunction} from 'remix'
import {useLoaderData, json, redirect, useCatch} from 'remix'
import {Link, useLocation} from 'react-router-dom'
import type {KCDLoader, CWKEpisode, CWKListItem, KCDHandle} from '~/types'
import clsx from 'clsx'
import {motion} from 'framer-motion'
import type {LoaderData as RootLoaderData} from '../root'
import {getSeasons} from '~/utils/simplecast.server'
import {H2, H3, H6, Paragraph} from '~/components/typography'
import {Grid} from '~/components/grid'
import {ArrowIcon} from '~/components/icons/arrow-icon'
import {ClipboardIcon} from '~/components/icons/clipboard-icon'
import {CheckCircledIcon} from '~/components/icons/check-circled-icon'
import {GithubIcon} from '~/components/icons/github-icon'
import {TwitterIcon} from '~/components/icons/twitter-icon'
import {PlusIcon} from '~/components/icons/plus-icon'
import {FeaturedSection} from '~/components/sections/featured-section'
import {ArrowLink, BackLink} from '~/components/arrow-button'
import {ChevronRightIcon} from '~/components/icons/chevron-right-icon'
import {ChevronLeftIcon} from '~/components/icons/chevron-left-icon'
import {
  formatTime,
  getDisplayUrl,
  getUrl,
  listify,
  reuseUsefulLoaderHeaders,
} from '~/utils/misc'
import {getCWKEpisodePath, getFeaturedEpisode} from '~/utils/chats-with-kent'
import {Themed} from '~/utils/theme-provider'
import {getSocialImageWithPreTitle} from '~/images'
import {getSocialMetas} from '~/utils/seo'
import {FourOhFour} from '~/components/errors'
import {IconLink} from '~/components/icon-link'
import {useRootData} from '~/utils/use-root-data'
import {Spacer} from '~/components/spacer'

export const handle: KCDHandle = {
  getSitemapEntries: async request => {
    const seasons = await getSeasons({request})
    return seasons.flatMap(season => {
      return season.episodes.map(episode => {
        const s = String(season.seasonNumber).padStart(2, '0')
        const e = String(episode.episodeNumber).padStart(2, '0')
        return {
          route: `/chats/${s}/${e}/${episode.slug}`,
          changefreq: 'weekly',
          lastmod: new Date(episode.updatedAt).toISOString(),
          priority: 0.4,
        }
      })
    })
  },
}

export const meta: MetaFunction = ({data, parentsData}) => {
  const episode = (data as LoaderData | undefined)?.episode
  const {requestInfo} = parentsData.root as RootLoaderData
  if (!episode) {
    return {
      title: 'Chats with Kent Episode not found',
    }
  }
  const {
    description,
    image,
    mediaUrl,
    simpleCastId,
    episodeNumber,
    seasonNumber,
  } = episode
  const title = `${episode.title} | Chats with Kent Podcast | ${episodeNumber}`
  const playerUrl = `https://player.simplecast.com/${simpleCastId}`
  return {
    ...getSocialMetas({
      origin: requestInfo.origin,
      title,
      description,
      keywords: `chats with kent, kent c. dodds, ${
        episode.meta?.keywords ?? ''
      }`,
      url: getUrl(requestInfo),
      image: getSocialImageWithPreTitle({
        origin: requestInfo.origin,
        title: episode.title,
        preTitle: 'Check out this Podcast',
        featuredImage: image,
        url: getDisplayUrl({
          origin: requestInfo.origin,
          path: getCWKEpisodePath({seasonNumber, episodeNumber}),
        }),
      }),
    }),
    'twitter:card': 'player',
    'twitter:player': playerUrl,
    'twitter:player:width': '436',
    'twitter:player:height': '196',
    'twitter:player:stream': mediaUrl,
    'twitter:player:stream:content_type': 'audio/mpeg',
  }
}

type LoaderData = {
  prevEpisode: CWKListItem | null
  nextEpisode: CWKListItem | null
  featured: CWKListItem | null
  episode: CWKEpisode
}

export const loader: KCDLoader<{
  slug: string
  season: string
  episode: string
}> = async ({request, params}) => {
  const seasonNumber = Number(params.season)
  const episodeNumber = Number(params.episode)

  const seasons = await getSeasons({request})
  const season = seasons.find(s => s.seasonNumber === seasonNumber)
  if (!season) {
    throw new Response(`Season ${seasonNumber} not found`, {status: 404})
  }
  const episode = season.episodes.find(e => e.episodeNumber === episodeNumber)
  if (!episode) {
    throw new Response(`Episode ${episodeNumber} not found`, {status: 404})
  }

  // we don't actually need the slug, but we'll redirect them to the place
  // with the slug so the URL looks correct.
  if (episode.slug !== params.slug) {
    return redirect(`/chats/${params.season}/${params.episode}/${episode.slug}`)
  }

  const data: LoaderData = {
    prevEpisode:
      season.episodes.find(e => e.episodeNumber === episodeNumber - 1) ?? null,
    nextEpisode:
      season.episodes.find(e => e.episodeNumber === episodeNumber + 1) ?? null,
    featured: getFeaturedEpisode(season.episodes.filter(e => episode !== e)),
    episode,
  }

  return json(data, {
    headers: {
      'Cache-Control': 'public, max-age=600',
      Vary: 'Cookie',
    },
  })
}

export const headers: HeadersFunction = reuseUsefulLoaderHeaders

function Homework({
  homeworkHTMLs = [],
}: {
  homeworkHTMLs: CWKEpisode['homeworkHTMLs']
}) {
  return (
    <div className="bg-secondary p-10 pb-16 w-full rounded-lg">
      <H6 as="h4" className="inline-flex items-center mb-8 space-x-4">
        <ClipboardIcon />
        <span>Homework</span>
      </H6>

      <ul className="text-primary html -mb-10 text-lg font-medium">
        {homeworkHTMLs.map(homeworkHTML => (
          <li
            key={homeworkHTML}
            className="border-secondary flex pb-10 pt-8 border-t"
          >
            <CheckCircledIcon
              className="flex-none mr-6 text-gray-400 dark:text-gray-600"
              size={24}
            />

            <div dangerouslySetInnerHTML={{__html: homeworkHTML}} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Resources({resources = []}: {resources: CWKEpisode['resources']}) {
  return (
    <div className="bg-secondary p-10 pb-16 rounded-lg">
      <h4 className="text-primary inline-flex items-center mb-8 text-xl font-medium">
        Resources
      </h4>

      <ul className="text-secondary text-lg font-medium space-y-8 lg:space-y-2">
        {resources.map(resource => (
          <li key={resource.url}>
            <a
              href={resource.url}
              className="hover:text-team-current focus:text-team-current focus:outline-none transition"
            >
              <span>{resource.name}</span>
              <span className="inline-block align-top ml-4 mt-1">
                <ArrowIcon size={26} direction="top-right" />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Guests({episode}: {episode: CWKEpisode}) {
  return (
    <>
      <h4 className="sr-only">Guests</h4>

      {episode.guests.map(guest => (
        <div
          key={guest.name}
          className="text-secondary bg-secondary flex flex-col p-10 pb-16 rounded-lg md:flex-row md:items-center md:pb-12"
        >
          <img
            src={episode.image}
            alt={guest.name}
            className="flex-none mb-6 mr-8 w-20 h-20 rounded-lg object-cover md:mb-0"
          />
          <div className="mb-6 w-full md:flex-auto md:mb-0">
            <div className="text-primary mb-2 text-xl font-medium leading-none">
              {guest.name}
            </div>
            <p className="text-xl leading-none">{guest.company}</p>
          </div>
          <div className="flex flex-none space-x-4">
            {guest.twitter ? (
              <a
                target="_blank"
                rel="noreferrer noopener"
                href={`https://twitter.com/${guest.twitter}`}
                aria-label="twitter profile"
              >
                <TwitterIcon size={32} />
              </a>
            ) : null}

            {guest.github ? (
              <a
                target="_blank"
                rel="noreferrer noopener"
                href={`https://github.com/${guest.github}`}
                aria-label="github profile"
              >
                <GithubIcon size={32} />
              </a>
            ) : null}
          </div>
        </div>
      ))}
    </>
  )
}

function Transcript({
  transcriptHTML,
}: {
  transcriptHTML: CWKEpisode['transcriptHTML']
}) {
  const [collapsed, setCollapsed] = useState(true)

  // re-collapse the trascript when changing the episode
  const location = useLocation()
  React.useEffect(() => {
    setCollapsed(true)
  }, [location.key])

  return (
    <div className="bg-secondary col-span-full p-10 pb-16 rounded-lg">
      <h4 className="text-primary inline-flex items-center mb-8 text-xl font-medium">
        Transcript
      </h4>

      <div
        className={clsx(
          'prose prose-light dark:prose-dark relative overflow-hidden',
          {
            'max-h-96': collapsed,
          },
        )}
      >
        <div dangerouslySetInnerHTML={{__html: transcriptHTML}} />

        {collapsed ? (
          <div className="absolute bottom-0 w-full h-48 bg-gradient-to-b from-transparent to-gray-100 dark:to-gray-800" />
        ) : null}
      </div>
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="group text-primary inline-flex items-center mt-16 text-xl focus:outline-none transition"
        >
          <span>Read the full transcript</span>
          <span className="group-hover:border-primary group-focus:border-primary inline-flex flex-none items-center justify-center ml-8 p-1 w-14 h-14 border-2 border-gray-200 dark:border-gray-600 rounded-full">
            <PlusIcon />
          </span>
        </button>
      ) : null}
    </div>
  )
}

const imageVariants = {
  initial: {
    opacity: 1,
  },
  hover: {
    opacity: 0.2,
  },
}
const arrowVariants = {
  initial: {
    opacity: 0,
  },
  hover: {
    scale: 2,
    opacity: 1,
  },
  tapLeft: {
    x: -5,
    opacity: 0,
  },
  tapRight: {
    x: 5,
    opacity: 1,
  },
}

const MotionLink = motion(Link)

function PrevNextButton({
  episodeListItem,
  direction,
}: {
  episodeListItem?: CWKListItem | null
  direction: 'prev' | 'next'
}) {
  if (!episodeListItem) {
    return <div /> // return empty div for easy alignment
  }

  return (
    <MotionLink
      initial="initial"
      whileHover="hover"
      whileFocus="hover"
      whileTap={direction === 'next' ? 'tapRight' : 'tapLeft'}
      animate="initial"
      to={getCWKEpisodePath(episodeListItem)}
      className={clsx('flex items-start focus:outline-none', {
        'flex-row-reverse': direction === 'next',
      })}
    >
      <div className="relative flex-none mt-1 w-12 h-12 rounded-lg overflow-hidden">
        <motion.img
          variants={imageVariants}
          transition={{duration: 0.2}}
          className="w-full h-full object-cover"
          src={episodeListItem.image}
          alt={episodeListItem.title}
        />
        <motion.div
          variants={arrowVariants}
          className="text-primary absolute inset-0 flex items-center justify-center origin-center"
        >
          {direction === 'next' ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </motion.div>
      </div>
      <div
        className={clsx('flex flex-col', {
          'ml-4 items-start': direction === 'prev',
          'mr-4 items-end text-right': direction === 'next',
        })}
      >
        <p className="text-primary text-lg font-medium">
          {episodeListItem.guests[0]?.name}
        </p>
        <h6 className="text-secondary text-lg font-medium">
          {`Episode ${episodeListItem.episodeNumber}`}
        </h6>
      </div>
    </MotionLink>
  )
}

export default function PodcastDetail() {
  const {requestInfo} = useRootData()
  const {episode, featured, nextEpisode, prevEpisode} =
    useLoaderData<LoaderData>()
  const permalink = `${requestInfo.origin}${getCWKEpisodePath(episode)}`

  return (
    <>
      <Grid className="mb-10 mt-24 lg:mb-24">
        <BackLink
          to="/chats"
          className="col-span-full lg:col-span-8 lg:col-start-3"
        >
          Back to overview
        </BackLink>
      </Grid>

      <Grid as="header" className="mb-12">
        <H2 className="col-span-full lg:col-span-8 lg:col-start-3">
          {episode.title}
        </H2>
      </Grid>

      <Grid as="main" className="mb-24 lg:mb-64">
        <div className="col-span-full mb-16 lg:col-span-8 lg:col-start-3">
          <Themed
            // changing the theme while the player is going will cause it to
            // unload the player in the one theme and load it in the other
            // which is annoying.
            initialOnly={true}
            dark={
              <iframe
                className="mb-4"
                title="player"
                height="200px"
                width="100%"
                frameBorder="no"
                scrolling="no"
                seamless
                src={`https://player.simplecast.com/${episode.simpleCastId}?dark=true`}
              />
            }
            light={
              <iframe
                className="mb-4"
                title="player"
                height="200px"
                width="100%"
                frameBorder="no"
                scrolling="no"
                seamless
                src={`https://player.simplecast.com/${episode.simpleCastId}?dark=false`}
              />
            }
          />

          <div className="flex justify-between">
            <PrevNextButton episodeListItem={prevEpisode} direction="prev" />
            <PrevNextButton episodeListItem={nextEpisode} direction="next" />
          </div>
        </div>

        <H3
          className="col-span-full lg:col-span-8 lg:col-start-3"
          dangerouslySetInnerHTML={{__html: episode.descriptionHTML}}
        />

        <Spacer size="3xs" className="col-span-full" />

        <div className="col-span-full lg:col-span-8 lg:col-start-3">
          <IconLink
            className="flex gap-2"
            target="_blank"
            rel="noreferrer noopener"
            href={`https://twitter.com/intent/tweet?${new URLSearchParams({
              url: permalink,
              text: `I just listened to "${episode.title}" with ${listify(
                episode.guests
                  .map(g => (g.twitter ? `@${g.twitter}` : null))
                  .filter(Boolean),
              )} on the Call Kent Podcast 🎙 by @kentcdodds`,
            })}`}
          >
            <TwitterIcon title="Tweet this" />
            <span>Tweet this episode</span>
          </IconLink>
        </div>

        <Spacer size="2xs" className="col-span-full" />

        <Paragraph
          as="div"
          className="col-span-full space-y-6 lg:col-span-8 lg:col-start-3"
          dangerouslySetInnerHTML={{__html: episode.summaryHTML}}
        />

        <Spacer size="3xs" className="col-span-full" />

        <div className="col-span-full space-y-4 lg:col-span-8 lg:col-start-3">
          {episode.homeworkHTMLs.length > 0 ? (
            <Homework homeworkHTMLs={episode.homeworkHTMLs} />
          ) : null}
          {episode.resources.length > 0 ? (
            <Resources resources={episode.resources} />
          ) : null}
          <Guests episode={episode} />
          {episode.transcriptHTML ? (
            <Transcript transcriptHTML={episode.transcriptHTML} />
          ) : null}
        </div>
      </Grid>

      <Grid>
        <div className="flex flex-col col-span-full mb-20 space-y-10 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <div className="space-y-2 lg:space-y-0">
            <H2>Sweet episode right?</H2>
            <H2 variant="secondary" as="p">
              You will love this one too.{' '}
            </H2>
          </div>

          <ArrowLink to="/chats" direction="right">
            See all episodes
          </ArrowLink>
        </div>
      </Grid>

      {featured ? (
        <FeaturedSection
          cta="Listen to this episode"
          caption="Featured episode"
          subTitle={`Season ${featured.seasonNumber} Episode ${
            featured.episodeNumber
          } — ${formatTime(featured.duration)}`}
          title={featured.title}
          href={getCWKEpisodePath(featured)}
          imageUrl={featured.image}
          imageAlt={listify(featured.guests.map(g => g.name))}
        />
      ) : null}
    </>
  )
}

export function CatchBoundary() {
  const caught = useCatch()
  console.error('CatchBoundary', caught)
  if (caught.status === 404) {
    return <FourOhFour />
  }
  throw new Error(`Unhandled error: ${caught.status}`)
}
