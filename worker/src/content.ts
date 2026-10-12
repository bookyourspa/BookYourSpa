/**
 * BookYourSpa — shared content catalog.
 * Single source of truth for: static page generation (web) and database seeding (worker).
 * Keep this file framework-free (plain data + tiny helpers).
 */

export type Destination = {
  slug: string; name: string; country: string; image: string;
  tagline: string; blurb: string;
};

export type Category = {
  slug: string; name: string; image: string; blurb: string;
};

export type Treatment = {
  slug: string; name: string; category: string; duration: number;
  price: number; image: string; blurb: string; description: string;
};

export type SpaPackage = {
  slug: string; name: string; duration: number; price: number;
  image: string; blurb: string; includes: string[];
};

export type Spa = {
  id: string; slug: string; name: string; destination: string;
  city: string; country: string; address: string;
  summary: string; description: string[];
  image: string; gallery: string[];
  facilities: string[]; categories: string[];
  priceLevel: number; rating: number; reviewCount: number;
  featured: boolean; lat: number; lng: number;
  hours: { open: string; close: string; closed: boolean }[]; // index 0 = Monday
  treatments: { slug: string; price: number }[];
  packages: { slug: string; price: number }[];
};

export type Offer = {
  code: string; title: string; description: string;
  discountType: 'percent' | 'fixed'; value: number;
  minSpend: number; destination: string | null;
  startsAt: string; endsAt: string; image: string;
};

export type Review = {
  name: string; city: string; rating: number; date: string;
  spaSlug: string; title: string; body: string;
};

export type Faq = { q: string; a: string };

export const SITE = {
  name: 'BookYourSpa',
  tagline: 'The art of feeling renewed',
  url: 'https://bookyourspa.net',
  email: 'hello@bookyourspa.net',
  supportEmail: 'support@bookyourspa.net',
  phone: '+1 (888) 555-0184',
  address: '1847 Serenity Row, Suite 400, New York, NY 10018',
  currency: 'USD',
  currencySymbol: '$',
  founded: 2021,
  social: {
    instagram: 'https://instagram.com/bookyourspa',
    facebook: 'https://facebook.com/bookyourspa',
    twitter: 'https://x.com/bookyourspa',
    pinterest: 'https://pinterest.com/bookyourspa',
  },
};

export const DEFAULT_SETTINGS = {
  site_title: 'BookYourSpa — Luxury Spa & Wellness Booking',
  site_description:
    'Discover and book luxury spas, massages and wellness treatments worldwide. Real-time availability, secure payment and instant confirmation on BookYourSpa.',
  site_keywords: 'spa booking, luxury spa, massage booking, wellness treatments, spa packages, book spa online',
  og_image: '/images/hero/hero-spa.jpg',
  hero_eyebrow: 'Luxury wellness, curated',
  hero_title: 'Where stillness becomes an art',
  hero_subtitle:
    'Reserve exceptional spas, signature massages and restorative rituals in the world’s most beautiful destinations — in under sixty seconds.',
  announcement: 'Complimentary welcome ritual on your first booking with code WELCOME15',
  commission_percent: 15,
  cancellation_hours: 24,
  currency: 'USD',
  timezone: 'UTC',
  demo_payment: '1', // payments run in demo mode until Stripe keys are configured
  featured_heading: 'Featured sanctuaries',
  reviews_heading: 'Guests who found their calm',
  faq_heading: 'Everything you may wish to know',
};

export const DESTINATIONS: Destination[] = [
  { slug: 'bali', name: 'Bali', country: 'Indonesia', image: '/images/destination/bali.jpg',
    tagline: 'Island of the gods',
    blurb: 'Jungle spas, ancient lapis rituals and open-air pavilions above the rice fields of Ubud.' },
  { slug: 'santorini', name: 'Santorini', country: 'Greece', image: '/images/destination/santorini.jpg',
    tagline: 'Caldera calm',
    blurb: 'Cave spas and sunset thermal pools carved into the volcanic cliffs of the Aegean.' },
  { slug: 'dubai', name: 'Dubai', country: 'United Arab Emirates', image: '/images/destination/dubai.jpg',
    tagline: 'Desert opulence',
    blurb: 'Hammams, gold-infused facials and skyline pools from the world’s most lavish houses.' },
  { slug: 'london', name: 'London', country: 'United Kingdom', image: '/images/destination/london.jpg',
    tagline: 'Modern ritual',
    blurb: 'Townhouse bathhouses and clinical skincare ateliers across the capital.' },
  { slug: 'paris', name: 'Paris', country: 'France', image: '/images/destination/paris.jpg',
    tagline: 'Rive gauche radiance',
    blurb: 'Haussmannian suites, wine therapies and slow beauty in the sixth arrondissement.' },
  { slug: 'new-york', name: 'New York', country: 'United States', image: '/images/destination/new-york.jpg',
    tagline: 'Recovery, refined',
    blurb: 'Nordic saunas, contrast therapy and deep-tissue specialists from SoHo to Tribeca.' },
  { slug: 'bangkok', name: 'Bangkok', country: 'Thailand', image: '/images/destination/bangkok.jpg',
    tagline: 'The original ritual',
    blurb: 'Thai massage lineages, orchid steams and riverside spa estates.' },
  { slug: 'maldives', name: 'Maldives', country: 'Maldives', image: '/images/destination/maldives.jpg',
    tagline: 'Overwater silence',
    blurb: 'Glass-floor treatment rooms and salt-water thalassotherapy above the lagoon.' },
];

export const CATEGORIES: Category[] = [
  { slug: 'massage', name: 'Massage', image: '/images/treatment/signature-massage.jpg',
    blurb: 'Signature, deep tissue, Thai and four-hand rituals from master therapists.' },
  { slug: 'skincare', name: 'Facials & Skincare', image: '/images/treatment/radiance-facial.jpg',
    blurb: 'Clinical and holistic facials with visible, luminous results.' },
  { slug: 'body', name: 'Body Treatments', image: '/images/treatment/body-wrap.jpg',
    blurb: 'Wraps, scrubs and polishes that leave skin impossibly soft.' },
  { slug: 'thermal', name: 'Sauna & Thermal', image: '/images/treatment/thermal-sauna.jpg',
    blurb: 'Finnish saunas, salt rooms and infrared heat rituals.' },
  { slug: 'hydro', name: 'Hydrotherapy', image: '/images/hero/hero-pool.jpg',
    blurb: 'Contrast pools, vitality baths and jet circuits.' },
  { slug: 'wellness', name: 'Wellness Therapies', image: '/images/treatment/aromatherapy.jpg',
    blurb: 'Breathwork, reiki, sound baths and aromatherapy journeys.' },
];

export const TREATMENT_CATALOG: Treatment[] = [
  { slug: 'signature-massage', name: 'Signature Spa Massage', category: 'massage', duration: 60, price: 110,
    image: '/images/treatment/signature-massage.jpg',
    blurb: 'Our most requested ritual — flowing pressure, warm oil, quiet room.',
    description: 'A bespoke full-body massage blending Swedish flow with gentle myofascial release. Your therapist adapts pressure in real time using warm botanical oils selected for your mood on the day.' },
  { slug: 'swedish', name: 'Swedish Relaxation Massage', category: 'massage', duration: 60, price: 95,
    image: '/images/treatment/swedish.jpg',
    blurb: 'Long, gliding strokes to melt tension and improve circulation.',
    description: 'The classic. Long, rhythmic strokes and gentle kneading ease muscular tension, encourage lymphatic flow and prepare the body for deep, restorative sleep.' },
  { slug: 'deep-tissue', name: 'Deep Tissue Massage', category: 'massage', duration: 60, price: 130,
    image: '/images/treatment/signature-massage.jpg',
    blurb: 'Focused, slow pressure for chronic tension and athletic recovery.',
    description: 'Slow, deliberate pressure reaches the deeper layers of muscle and fascia. Ideal for desk-bound shoulders, training soreness and long-standing postural tension.' },
  { slug: 'hot-stone', name: 'Hot Stone Therapy', category: 'massage', duration: 75, price: 140,
    image: '/images/treatment/hot-stone.jpg',
    blurb: 'Basalt stones at 52°C open the body before the work even begins.',
    description: 'Smooth basalt stones warmed to 52°C are placed along the spine and worked into tight muscle. Heat penetrates deeply, allowing the therapist to release tension with less pressure.' },
  { slug: 'aromatherapy', name: 'Aromatherapy Journey', category: 'wellness', duration: 75, price: 125,
    image: '/images/treatment/aromatherapy.jpg',
    blurb: 'A custom essential-oil blend paired with slow lymphatic work.',
    description: 'Begin with a personal aromatherapy consultation, then drift through slow, circling massage with a blend created for you — Neroli for calm, rosemary for clarity, vetiver for grounding.' },
  { slug: 'radiance-facial', name: 'Radiance Facial', category: 'skincare', duration: 60, price: 120,
    image: '/images/treatment/radiance-facial.jpg',
    blurb: 'Cleanse, resurface, massage, mask — lit-from-within glow.',
    description: 'A double cleanse, gentle enzyme resurfacing, sculpting facial massage and a bespoke mask. Finishes with hydrating serums and SPF for immediate, camera-ready luminosity.' },
  { slug: 'clarifying-facial', name: 'Clarifying Medi-Facial', category: 'skincare', duration: 45, price: 150,
    image: '/images/treatment/medi-facial.jpg',
    blurb: 'Clinical-grade actives for congestion, texture and tone.',
    description: 'A results-driven treatment combining salicylic exfoliation, extraction and LED therapy. Your therapist prescribes an at-home cadence to hold the results between visits.' },
  { slug: 'body-wrap', name: 'Marine Body Wrap', category: 'body', duration: 90, price: 175,
    image: '/images/treatment/body-wrap.jpg',
    blurb: 'Mineral-rich algae cocoon with a full-body polish.',
    description: 'A vigorous sugar-and-salt polish prepares the skin, followed by a warm marine algae wrap rich in minerals. Rest under heated linens while the wrap detoxifies and softens.' },
  { slug: 'salt-scrub', name: 'Bamboo Salt Body Scrub', category: 'body', duration: 45, price: 85,
    image: '/images/treatment/body-wrap.jpg',
    blurb: 'Mineral salts and bamboo polish for impossibly soft skin.',
    description: 'Dead Sea salts blended with warming bamboo charcoal exfoliate from heel to neck, followed by a whipped shea butter seal. The fastest route to holiday skin.' },
  { slug: 'thermal-ritual', name: 'Thermal Sauna Ritual', category: 'thermal', duration: 90, price: 70,
    image: '/images/treatment/thermal-sauna.jpg',
    blurb: 'Guided sauna, cold plunge and rest — the contrast circuit.',
    description: 'A guided circuit of Finnish sauna, cold plunge and guided rest, repeated three times. Quiets inflammation, elevates mood and improves sleep quality for days afterwards.' },
  { slug: 'hydro-circuit', name: 'Hydrotherapy Circuit', category: 'hydro', duration: 60, price: 65,
    image: '/images/hero/hero-pool.jpg',
    blurb: 'Vitality pools, jets and a warm quartz bed.',
    description: 'Move through warm vitality pools, high-pressure jets and a heated quartz relaxation bed at your own pace. Perfect as an add-on before any massage.' },
  { slug: 'sound-bath', name: 'Sound Bath & Breathwork', category: 'wellness', duration: 60, price: 90,
    image: '/images/treatment/aromatherapy.jpg',
    blurb: 'Tibetan bowls, guided breath and thirty minutes of nothing.',
    description: 'Lie back beneath weighted blankets as quartz bowls and gongs move over you. A guided breathwork opening clears the mind before the sound begins.' },
];

export const PACKAGE_CATALOG: SpaPackage[] = [
  { slug: 'retreat-day', name: 'The Retreat Day', duration: 300, price: 320,
    image: '/images/package/retreat-day.jpg',
    blurb: 'Five hours of complete permission to do nothing.',
    includes: ['Welcome ritual & herbal tonic', '60-minute signature massage', '60-minute radiance facial', 'Thermal suite access', 'Seasonal spa lunch', 'Take-home botanical gift'] },
  { slug: 'couples-sanctuary', name: 'Couples Sanctuary', duration: 120, price: 480,
    image: '/images/package/couples-sanctuary.jpg',
    blurb: 'Side-by-side silence with someone you love.',
    includes: ['90-minute massage for two', 'Private thermal suite', 'Champagne & chocolate service', 'Candle ritual take-home'] },
  { slug: 'weekend-escape', name: 'Weekend Escape', duration: 180, price: 260,
    image: '/images/package/weekend-escape.jpg',
    blurb: 'A half-day reset between Fridays and Mondays.',
    includes: ['Hydrotherapy circuit', '60-minute treatment of choice', 'Salt scrub', 'Relaxation lounge & tea ceremony'] },
  { slug: 'executive-renewal', name: 'Executive Renewal', duration: 90, price: 220,
    image: '/images/package/executive-renewal.jpg',
    blurb: 'For shoulders that live in boardrooms.',
    includes: ['30-minute back, neck & shoulder work', '60-minute deep tissue massage', 'Express radiance facial', 'Quiet lounge & cold-pressed juice'] },
];

const HOURS_STD = [
  { open: '09:00', close: '21:00', closed: false }, // Mon
  { open: '09:00', close: '21:00', closed: false },
  { open: '09:00', close: '21:00', closed: false },
  { open: '09:00', close: '22:00', closed: false },
  { open: '09:00', close: '22:00', closed: false },
  { open: '08:00', close: '22:00', closed: false },
  { open: '10:00', close: '20:00', closed: false },
];
const HOURS_LATE = [
  { open: '10:00', close: '23:00', closed: false },
  { open: '10:00', close: '23:00', closed: false },
  { open: '10:00', close: '23:00', closed: false },
  { open: '10:00', close: '23:30', closed: false },
  { open: '10:00', close: '23:30', closed: false },
  { open: '09:00', close: '23:30', closed: false },
  { open: '09:00', close: '22:00', closed: false },
];
const HOURS_ISLAND = [
  { open: '09:00', close: '20:00', closed: false },
  { open: '09:00', close: '20:00', closed: false },
  { open: '09:00', close: '20:00', closed: false },
  { open: '09:00', close: '21:00', closed: false },
  { open: '09:00', close: '21:00', closed: false },
  { open: '08:00', close: '21:00', closed: false },
  { open: '08:00', close: '21:00', closed: false },
];

export const SPAS: Spa[] = [
  {
    id: 'spa-aurora', slug: 'aurora-wellness-house', name: 'Aurora Wellness House',
    destination: 'london', city: 'London', country: 'United Kingdom',
    address: '42 Chiltern Street, Marylebone, London W1U 7QH',
    summary: 'A Georgian townhouse reimagined as a four-floor bathhouse in the heart of Marylebone.',
    description: [
      'Aurora occupies a restored Georgian townhouse where original cornicing meets smoked oak, brushed brass and deep soaking tubs. Four floors unfold from a candlelit reception to a rooftop vitality pool with views across the rooftops of Marylebone.',
      'The house is built on the belief that rest is a discipline. Therapists train for a minimum of two years before working with guests, and every treatment begins with a quiet consultation in the tea library — no screens, no upsell, no clock on the wall.',
    ],
    image: '/images/spa/aurora-lounge.jpg',
    gallery: ['/images/spa/aurora-lounge.jpg', '/images/spa/serenity-pool.jpg', '/images/spa/zen-hands.jpg', '/images/treatment/signature-massage.jpg'],
    facilities: ['Rooftop vitality pool', 'Finnish sauna', 'Steam room', 'Ice fountain', 'Tea library', 'Couples suite', 'Private hire', 'Wheelchair access', 'Valet parking', 'Robes & slippers'],
    categories: ['massage', 'thermal', 'skincare'],
    priceLevel: 4, rating: 4.9, reviewCount: 312, featured: true,
    lat: 51.5194, lng: -0.1536, hours: HOURS_STD,
    treatments: [
      { slug: 'signature-massage', price: 135 }, { slug: 'hot-stone', price: 165 },
      { slug: 'deep-tissue', price: 155 }, { slug: 'radiance-facial', price: 145 },
      { slug: 'thermal-ritual', price: 85 }, { slug: 'sound-bath', price: 105 },
    ],
    packages: [{ slug: 'executive-renewal', price: 245 }, { slug: 'retreat-day', price: 360 }],
  },
  {
    id: 'spa-aegean', slug: 'aegean-serenity-spa', name: 'Aegean Serenity Spa',
    destination: 'santorini', city: 'Oia', country: 'Greece',
    address: 'Nikolaou Nomikou 54, Oia, Santorini 847 02',
    summary: 'A cave spa carved into the caldera with a heated infinity pool facing the volcano.',
    description: [
      'Cut two hundred years ago into the volcanic ash of the caldera wall, Aegean Serenity is all whitewashed curves, rough stone and the endless blue of the Aegean through a single arched window.',
      'Signature rituals draw on Greek botanicals — thyme honey, mastic, olive squalane — and the treatment rooms sit at a constant 24°C year round, warmed from beneath by the island’s famous springs.',
    ],
    image: '/images/spa/serenity-pool.jpg',
    gallery: ['/images/spa/serenity-pool.jpg', '/images/spa/maison-stones.jpg', '/images/treatment/radiance-facial.jpg', '/images/treatment/body-wrap.jpg'],
    facilities: ['Heated infinity pool', 'Cave steam room', 'Caldera view lounge', 'Hammam', 'Outdoor rain shower', 'Wine therapy room', 'Yoga deck', 'Breakfast terrace'],
    categories: ['massage', 'hydro', 'skincare'],
    priceLevel: 4, rating: 4.9, reviewCount: 198, featured: true,
    lat: 36.4618, lng: 25.3753, hours: HOURS_STD,
    treatments: [
      { slug: 'signature-massage', price: 140 }, { slug: 'aromatherapy', price: 150 },
      { slug: 'body-wrap', price: 195 }, { slug: 'radiance-facial', price: 155 },
      { slug: 'hydro-circuit', price: 75 },
    ],
    packages: [{ slug: 'couples-sanctuary', price: 540 }, { slug: 'weekend-escape', price: 295 }],
  },
  {
    id: 'spa-orchid', slug: 'orchid-stone-spa', name: 'Orchid & Stone Spa',
    destination: 'bangkok', city: 'Bangkok', country: 'Thailand',
    address: '41 Charoen Krung 30, Bang Rak, Bangkok 10500',
    summary: 'A riverside estate where royal Thai technique meets orchid steam and teak.',
    description: [
      'Set behind a teak door on the old river road, Orchid & Stone practises the royal line of Thai massage passed down through four generations of the Khun Wichai family.',
      'Floors of hand-cut stone stay cool underfoot while orchid steam rises in the herbal room. Therapists work with forearms, elbows and slow bodyweight pressure — the way it has been done for two hundred years.',
    ],
    image: '/images/spa/orchid-stones.jpg',
    gallery: ['/images/spa/orchid-stones.jpg', '/images/spa/zen-hands.jpg', '/images/treatment/aromatherapy.jpg', '/images/treatment/hot-stone.jpg'],
    facilities: ['Orchid steam room', 'Thai pavilion', 'Herbal compress kitchen', 'River terrace', 'Private treatment pavilions', 'Ayurvedic bar', 'Shuttle from Saphan Taksin'],
    categories: ['massage', 'wellness'],
    priceLevel: 3, rating: 4.8, reviewCount: 421, featured: true,
    lat: 13.7007, lng: 100.5145, hours: HOURS_LATE,
    treatments: [
      { slug: 'signature-massage', price: 75 }, { slug: 'deep-tissue', price: 85 },
      { slug: 'aromatherapy', price: 90 }, { slug: 'salt-scrub', price: 60 },
      { slug: 'hot-stone', price: 95 }, { slug: 'sound-bath', price: 65 },
    ],
    packages: [{ slug: 'retreat-day', price: 210 }, { slug: 'weekend-escape', price: 165 }],
  },
  {
    id: 'spa-nocturne', slug: 'nocturne-pool-spa', name: 'Nocturne Pool & Spa',
    destination: 'dubai', city: 'Dubai', country: 'United Arab Emirates',
    address: 'Level 41, Marasi Drive, Business Bay, Dubai',
    summary: 'A sky-high night spa with a black-tiled lap pool above the city lights.',
    description: [
      'Nocturne opens when the rest of the city goes home. Forty-one floors up, the black-tiled pool reflects a skyline that never quite sleeps, and the treatment rooms are lit only by fibre-optic stars.',
      'The menu is built for night owls: circadian-aware massage sequences, cold marble slabs for puffy eyes, and a midnight hammam that runs until 2am.',
    ],
    image: '/images/spa/lagoon-nightpool.jpg',
    gallery: ['/images/spa/lagoon-nightpool.jpg', '/images/spa/zenith-sauna.jpg', '/images/treatment/clarifying-facial.jpg', '/images/treatment/hot-stone.jpg'],
    facilities: ['Sky lap pool', 'Hammam', 'Finnish sauna', 'Snow room', 'Night bar', 'Private cabanas', 'City-view gym', 'Valet parking'],
    categories: ['thermal', 'massage', 'skincare'],
    priceLevel: 4, rating: 4.7, reviewCount: 264, featured: false,
    lat: 25.1872, lng: 55.2995, hours: HOURS_LATE,
    treatments: [
      { slug: 'deep-tissue', price: 170 }, { slug: 'clarifying-facial', price: 185 },
      { slug: 'thermal-ritual', price: 95 }, { slug: 'hydro-circuit', price: 85 },
      { slug: 'hot-stone', price: 180 },
    ],
    packages: [{ slug: 'executive-renewal', price: 275 }, { slug: 'couples-sanctuary', price: 590 }],
  },
  {
    id: 'spa-zenith', slug: 'zenith-sauna-haus', name: 'Zenith Sauna Haus',
    destination: 'new-york', city: 'New York', country: 'United States',
    address: '118 Greene Street, SoHo, New York, NY 10012',
    summary: 'A Nordic-inspired bathhouse of cedar, ice and contrast therapy in SoHo.',
    description: [
      'Zenith brings the Nordic bathhouse to Greene Street: three cedar saunas, a plunge pool held at 4°C, and an infrared room for slow, deep heat.',
      'It is deliberately minimalist — brass hooks, linen towels, cold brew at the rest bench. Book the contrast circuit with a therapist, or take the rooms at your own rhythm.',
    ],
    image: '/images/spa/zenith-sauna.jpg',
    gallery: ['/images/spa/zenith-sauna.jpg', '/images/spa/haven-sauna.jpg', '/images/spa/terrace-loungers.jpg', '/images/treatment/thermal-sauna.jpg'],
    facilities: ['Three cedar saunas', '4°C plunge pool', 'Infrared room', 'Salt room', 'Cold brew bar', 'Roof garden', 'Lockers & linen', 'Members’ lounge'],
    categories: ['thermal', 'hydro'],
    priceLevel: 4, rating: 4.8, reviewCount: 356, featured: true,
    lat: 40.7234, lng: -73.9985, hours: HOURS_STD,
    treatments: [
      { slug: 'thermal-ritual', price: 90 }, { slug: 'hydro-circuit', price: 80 },
      { slug: 'deep-tissue', price: 175 }, { slug: 'salt-scrub', price: 105 },
      { slug: 'sound-bath', price: 110 },
    ],
    packages: [{ slug: 'weekend-escape', price: 310 }, { slug: 'executive-renewal', price: 265 }],
  },
  {
    id: 'spa-ubud', slug: 'ubud-botanica-spa', name: 'Ubud Botanica Spa',
    destination: 'bali', city: 'Ubud', country: 'Indonesia',
    address: 'Jl. Raya Sanggingan, Ubud, Gianyar 80571',
    summary: 'Open-air pavilions above the Campuhan valley with a jungle hydro pool.',
    description: [
      'Botanica sits on the lip of the Campuhan valley, where treatment pavilions open on three sides to the sound of water and nothing else. Everything used in the rooms is grown within a kilometre — coconut, turmeric, frangipani, cacao.',
      'The signature is the Balinese boreh: a warm spice paste of clove, ginger and cinnamon, applied thick and rested under banana leaf. Guests book it before sunrise.',
    ],
    image: '/images/spa/ubud-villas.jpg',
    gallery: ['/images/spa/ubud-villas.jpg', '/images/spa/terrace-loungers.jpg', '/images/treatment/body-wrap.jpg', '/images/treatment/signature-massage.jpg'],
    facilities: ['Jungle hydro pool', 'Open-air pavilions', 'Herbal garden', 'Yoga shala', 'Rice-field terrace', 'Raw food café', 'Complimentary transfers', 'Couples bale'],
    categories: ['massage', 'body', 'wellness'],
    priceLevel: 3, rating: 4.9, reviewCount: 508, featured: true,
    lat: -8.5069, lng: 115.2625, hours: HOURS_ISLAND,
    treatments: [
      { slug: 'signature-massage', price: 65 }, { slug: 'body-wrap', price: 110 },
      { slug: 'salt-scrub', price: 55 }, { slug: 'aromatherapy', price: 80 },
      { slug: 'sound-bath', price: 60 }, { slug: 'swedish', price: 60 },
    ],
    packages: [{ slug: 'retreat-day', price: 195 }, { slug: 'couples-sanctuary', price: 340 }],
  },
  {
    id: 'spa-haven', slug: 'hudson-thermal-house', name: 'Hudson Thermal House',
    destination: 'new-york', city: 'New York', country: 'United States',
    address: '609 Hudson Street, Tribeca, New York, NY 10013',
    summary: 'A candlelit townhouse spa with barrel sauna and river-view rest loft.',
    description: [
      'Hudson is a 19th-century carriage house turned thermal retreat: a barrel sauna in the garden, a warm quartz bed in the cellar and a rest loft under the beams where phones are checked at the door.',
      'The house specialises in recovery — contrast therapy, sports massage and sleep treatment — with therapists who work with the city’s dancers and marathon runners.',
    ],
    image: '/images/spa/haven-sauna.jpg',
    gallery: ['/images/spa/haven-sauna.jpg', '/images/spa/aurora-lounge.jpg', '/images/treatment/swedish.jpg', '/images/treatment/hot-stone.jpg'],
    facilities: ['Barrel sauna', 'Garden plunge', 'Rest loft', 'Quartz heated bed', 'Sports therapy room', 'Tea bar', 'Phone-free policy', 'Shower suites'],
    categories: ['thermal', 'massage'],
    priceLevel: 4, rating: 4.7, reviewCount: 187, featured: false,
    lat: 40.7185, lng: -74.0087, hours: HOURS_STD,
    treatments: [
      { slug: 'deep-tissue', price: 165 }, { slug: 'hot-stone', price: 170 },
      { slug: 'thermal-ritual', price: 95 }, { slug: 'swedish', price: 135 },
      { slug: 'salt-scrub', price: 100 },
    ],
    packages: [{ slug: 'executive-renewal', price: 260 }, { slug: 'weekend-escape', price: 320 }],
  },
  {
    id: 'spa-maison', slug: 'maison-pierre-spa', name: 'Maison Pierre Spa',
    destination: 'paris', city: 'Paris', country: 'France',
    address: '12 Rue de Seine, 75006 Paris',
    summary: 'A hushed Marais maison for wine therapy, facials and slow beauty.',
    description: [
      'Behind an unmarked door in the sixth, Maison Pierre keeps ten treatment rooms around a candlelit courtyard. The house made its name with vinotherapy — grape-seed oil, warm cabernet wraps, presses from the Médoc.',
      'It is also the most quietly luxurious facial bar in Paris: microcurrent sculpting, lymphatic drainage and a finishing massage that reliably books the next appointment before you leave.',
    ],
    image: '/images/spa/maison-stones.jpg',
    gallery: ['/images/spa/maison-stones.jpg', '/images/spa/aurora-lounge.jpg', '/images/treatment/radiance-facial.jpg', '/images/treatment/body-wrap.jpg'],
    facilities: ['Courtyard', 'Hammam', 'Wine therapy room', 'Facial atelier', 'Private suites', 'Champagne salon', 'Florist', 'Concierge'],
    categories: ['skincare', 'body', 'massage'],
    priceLevel: 4, rating: 4.8, reviewCount: 231, featured: false,
    lat: 48.8536, lng: 2.3341, hours: HOURS_STD,
    treatments: [
      { slug: 'radiance-facial', price: 165 }, { slug: 'clarifying-facial', price: 190 },
      { slug: 'body-wrap', price: 210 }, { slug: 'signature-massage', price: 150 },
      { slug: 'aromatherapy', price: 165 },
    ],
    packages: [{ slug: 'retreat-day', price: 420 }, { slug: 'couples-sanctuary', price: 560 }],
  },
  {
    id: 'spa-velaa', slug: 'velaa-terrace-spa', name: 'Velaa Terrace Spa',
    destination: 'maldives', city: 'Baa Atoll', country: 'Maldives',
    address: 'Velaa Private Island, Baa Atoll, Maldives 06040',
    summary: 'Overwater treatment rooms with glass floors above a coral garden.',
    description: [
      'Velaa’s treatment rooms float above the lagoon — glass floors in the floor show parrotfish while you work on your shoulders, and the rest deck catches the sunrise over the reef.',
      'Thalassotherapy anchors the menu: warm seawater circuits, marine silts and a salt-room relaxation cave, all fed by the house’s own desalination garden.',
    ],
    image: '/images/spa/terrace-loungers.jpg',
    gallery: ['/images/spa/terrace-loungers.jpg', '/images/spa/serenity-pool.jpg', '/images/treatment/body-wrap.jpg', '/images/treatment/hot-stone.jpg'],
    facilities: ['Overwater suites', 'Thalasso circuit', 'Glass-floor rooms', 'Sunrise yoga deck', 'Coral garden bar', 'Private island transfers', 'Outdoor showers', 'Sunset pavilion'],
    categories: ['hydro', 'body', 'massage'],
    priceLevel: 4, rating: 5.0, reviewCount: 96, featured: false,
    lat: 5.1733, lng: 73.0500, hours: HOURS_ISLAND,
    treatments: [
      { slug: 'body-wrap', price: 240 }, { slug: 'hydro-circuit', price: 95 },
      { slug: 'signature-massage', price: 195 }, { slug: 'salt-scrub', price: 130 },
      { slug: 'aromatherapy', price: 210 },
    ],
    packages: [{ slug: 'couples-sanctuary', price: 720 }, { slug: 'retreat-day', price: 540 }],
  },
  {
    id: 'spa-sanur', slug: 'sanur-touch-retreat', name: 'Sanur Touch Retreat',
    destination: 'bali', city: 'Sanur', country: 'Indonesia',
    address: 'Jl. Danau Tamblingan 88, Sanur, Denpasar 80228',
    summary: 'A breezy beachside spa of sun loungers, salt pools and warm coconut oil.',
    description: [
      'Two minutes from the sand, Sanur Touch runs from sunrise to candlelight. Loungers line a saltwater pool shaded by frangipani, and the therapists are known across the island for their coconut-oil rituals.',
      'Come early: the morning light through the palm shutter is the reason half the regulars book the 7am slot.',
    ],
    image: '/images/spa/embrace-massage.jpg',
    gallery: ['/images/spa/embrace-massage.jpg', '/images/spa/terrace-loungers.jpg', '/images/treatment/signature-massage.jpg', '/images/treatment/body-wrap.jpg'],
    facilities: ['Saltwater pool', 'Beach shuttle', 'Sunrise terrace', 'Foot reflexology bar', 'Coconut bar', 'Open-air bales', 'Family room'],
    categories: ['massage', 'body'],
    priceLevel: 2, rating: 4.7, reviewCount: 344, featured: false,
    lat: -8.6878, lng: 115.2626, hours: HOURS_ISLAND,
    treatments: [
      { slug: 'swedish', price: 45 }, { slug: 'signature-massage', price: 50 },
      { slug: 'salt-scrub', price: 40 }, { slug: 'aromatherapy', price: 55 },
      { slug: 'hydro-circuit', price: 35 },
    ],
    packages: [{ slug: 'weekend-escape', price: 120 }, { slug: 'retreat-day', price: 150 }],
  },
  {
    id: 'spa-lumiere', slug: 'lumiere-skin-spa', name: 'Lumière Skin Spa',
    destination: 'dubai', city: 'Dubai', country: 'United Arab Emirates',
    address: 'Village Mall, Jumeirah 1, Dubai',
    summary: 'A clinical-luxury skincare house for facials, LED and golden-hour glow.',
    description: [
      'Lumière is a skincare house first and a spa second: diagnostic cameras, prescription facials and a laser floor overseen by two dermatologists — with the calm of a five-star hotel throughout.',
      'The golden-hour facial — 24-karat gold leaf, microcurrent and cold globes — is booked out most evenings before six.',
    ],
    image: '/images/spa/lumiere-facial.jpg',
    gallery: ['/images/spa/lumiere-facial.jpg', '/images/spa/lagoon-nightpool.jpg', '/images/treatment/clarifying-facial.jpg', '/images/treatment/radiance-facial.jpg'],
    facilities: ['Skin diagnostics', 'LED therapy rooms', 'Laser suite', 'Private facial bar', 'Prada-lit lounges', 'Valet parking', 'Makeup atelier', 'Nursing team'],
    categories: ['skincare'],
    priceLevel: 4, rating: 4.6, reviewCount: 158, featured: false,
    lat: 25.2097, lng: 55.2460, hours: HOURS_LATE,
    treatments: [
      { slug: 'clarifying-facial', price: 220 }, { slug: 'radiance-facial', price: 185 },
      { slug: 'salt-scrub', price: 110 }, { slug: 'aromatherapy', price: 175 },
    ],
    packages: [{ slug: 'executive-renewal', price: 290 }],
  },
  {
    id: 'spa-zenhands', slug: 'zen-hands-club', name: 'The Zen Hands Club',
    destination: 'london', city: 'London', country: 'United Kingdom',
    address: '7 Redchurch Street, Shoreditch, London E2 7DJ',
    summary: 'A Shoreditch movement-and-touch club for Thai massage, stretch and reset.',
    description: [
      'Zen Hands is part treatment room, part movement studio: stretching bars line one wall, therapists the other. Sessions blend Thai compression, assisted stretch and sports work for bodies that train hard and sit too long.',
      'The club’s thirty-minute reset is the fastest fix in East London — book it between meetings and walk out two inches taller.',
    ],
    image: '/images/spa/zen-hands.jpg',
    gallery: ['/images/spa/zen-hands.jpg', '/images/spa/zenith-sauna.jpg', '/images/treatment/swedish.jpg', '/images/treatment/aromatherapy.jpg'],
    facilities: ['Stretch studio', 'Treatment rooms', 'Contrast shower', 'Recovery lounge', 'CBD tea bar', 'Members’ lockers', 'Bike storage', 'Late openings'],
    categories: ['massage', 'wellness'],
    priceLevel: 3, rating: 4.6, reviewCount: 276, featured: false,
    lat: 51.5241, lng: -0.0729, hours: HOURS_LATE,
    treatments: [
      { slug: 'deep-tissue', price: 125 }, { slug: 'signature-massage', price: 115 },
      { slug: 'swedish', price: 105 }, { slug: 'sound-bath', price: 95 },
      { slug: 'thermal-ritual', price: 75 },
    ],
    packages: [{ slug: 'executive-renewal', price: 215 }, { slug: 'weekend-escape', price: 240 }],
  },
];

export const OFFERS: Offer[] = [
  { code: 'WELCOME15', title: '15% off your first ritual', description:
      'New to BookYourSpa? Enjoy fifteen percent off any treatment or package above $100 — our invitation to slow down.',
    discountType: 'percent', value: 15, minSpend: 100, destination: null,
    startsAt: '2026-01-01', endsAt: '2026-12-31', image: '/images/treatment/signature-massage.jpg' },
  { code: 'SERENE20', title: '20% off spa packages', description:
      'Reserve any full spa package of $300 or more midweek and a fifth of the bill quietly disappears.',
    discountType: 'percent', value: 20, minSpend: 300, destination: null,
    startsAt: '2026-09-01', endsAt: '2026-12-31', image: '/images/package/retreat-day.jpg' },
  { code: 'DUO25', title: '$25 off couples retreats', description:
      'For two: twenty-five dollars off every Couples Sanctuary booking, champagne ritual included.',
    discountType: 'fixed', value: 25, minSpend: 200, destination: null,
    startsAt: '2026-06-01', endsAt: '2027-02-14', image: '/images/package/couples-sanctuary.jpg' },
  { code: 'SUNRISE10', title: '10% off morning calm', description:
      'Monday to Thursday before noon, ten percent off every treatment. The city can wait.',
    discountType: 'percent', value: 10, minSpend: 0, destination: null,
    startsAt: '2026-01-01', endsAt: '2026-12-31', image: '/images/spa/terrace-loungers.jpg' },
];

export const REVIEWS: Review[] = [
  { name: 'Amelia Hart', city: 'London', rating: 5, date: '2026-09-18', spaSlug: 'aurora-wellness-house',
    title: 'The booking was effortless — the morning itself, unforgettable.',
    body: 'I reserved the retreat day on a Tuesday evening and had confirmation in my inbox before I closed the laptop. Aurora is genuinely special: quiet, warm and completely unhurried.' },
  { name: 'Daniel Okafor', city: 'New York', rating: 5, date: '2026-08-30', spaSlug: 'zenith-sauna-haus',
    title: 'Best contrast circuit outside Scandinavia.',
    body: 'Three saunas, a plunge that actually hurts, and a rest bench with cold brew. I slept nine hours that night. The live availability is accurate to the minute — no guesswork.' },
  { name: 'Sofia Marchetti', city: 'Milan', rating: 5, date: '2026-09-02', spaSlug: 'aegean-serenity-spa',
    title: 'A cave above the caldera.',
    body: 'We booked the couples sanctuary for our anniversary. Champagne waiting, volcano glowing outside the arch, and a therapist who read exactly how much pressure we needed.' },
  { name: 'Priya Raman', city: 'Bangkok', rating: 5, date: '2026-07-22', spaSlug: 'orchid-stone-spa',
    title: 'Royal Thai technique, properly done.',
    body: 'As someone raised on Thai massage, I am fussy. This is the real lineage — slow, precise, no shortcuts. Booking the 7pm slot straight from the airport was the best decision of the trip.' },
  { name: 'Marcus Vogel', city: 'Berlin', rating: 4, date: '2026-08-11', spaSlug: 'hudson-thermal-house',
    title: 'Recovery, engineered.',
    body: 'The sports massage sorted out a hamstring that two physios could not. Only note: it is popular, so book a few days ahead. The app made that painless.' },
  { name: 'Leïla Haddad', city: 'Paris', rating: 5, date: '2026-09-25', spaSlug: 'maison-pierre-spa',
    title: 'My skin has never looked like this.',
    body: 'The golden-hour facial is worth every euro. Courtyard candlelight on the way out, a glass of champagne, and booking confirmation that arrived before I reached the door.' },
  { name: 'Grace Chen', city: 'Singapore', rating: 5, date: '2026-06-14', spaSlug: 'velaa-terrace-spa',
    title: 'Glass floor, coral garden, zero thoughts.',
    body: 'You can watch the reef while a therapist works on your back. The marine wrap left my skin impossibly soft, and cancellation was handled in two taps when our flight moved.' },
  { name: 'Tom Whitfield', city: 'Manchester', rating: 5, date: '2026-08-04', spaSlug: 'zen-hands-club',
    title: 'Thirty minutes that fixed my week.',
    body: 'Booked the reset between meetings in Shoreditch. Walked out feeling like a different person. The reminders by email and in the dashboard are genuinely useful.' },
  { name: 'Isabella Rossi', city: 'Rome', rating: 5, date: '2026-07-07', spaSlug: 'ubud-botanica-spa',
    title: 'The boreh ritual at sunrise.',
    body: 'Worth the 5am wake-up. Warm spice paste, valley mist below the pavilion, frangipani everywhere. BookYourSpa handled the transfer details without me asking twice.' },
];

export const FAQS: Faq[] = [
  { q: 'How do I know a treatment is actually available?',
    a: 'Availability is calculated in real time from each spa’s working hours, therapist schedule and existing bookings. The slot you see on the booking screen is the slot you get — your appointment is held the moment payment is confirmed.' },
  { q: 'When and how do I receive my booking confirmation?',
    a: 'Instantly. A confirmation appears on screen, lands in your customer dashboard under Upcoming bookings, and arrives by email within seconds with your booking code, address, arrival guidance and cancellation window.' },
  { q: 'What is your cancellation policy?',
    a: 'Cancel or reschedule free of charge up to 24 hours before your appointment (set by each spa from their dashboard). Later cancellations are charged at 50% and no-shows in full. One tap in your dashboard handles it.' },
  { q: 'Is payment secure?',
    a: 'Yes. Payments are processed by Stripe over TLS with 3-D Secure where required. BookYourSpa never sees or stores your full card number — the platform only receives a payment reference and status.' },
  { q: 'Can I book for someone else?',
    a: 'Absolutely. Add the recipient’s name and any notes during booking, then share the confirmation email. Gift bookings can also be arranged with our team for packages above $200.' },
  { q: 'How do spas get paid, and what commission applies?',
    a: 'Suppliers keep 85% of every booking by default; the platform commission (15%) covers payment processing, marketing and support. Earnings and pending payouts are visible live in the supplier dashboard.' },
  { q: 'How do I list my spa on BookYourSpa?',
    a: 'Register through the Supplier portal with your business details. Our team reviews registrations within one business day, after which your listing, treatments, prices and availability are managed entirely from your private dashboard.' },
  { q: 'Can I buy a gift card or share a booking?',
    a: 'Yes — every package can be gifted. Choose “Gift booking” at checkout and we will email a personalised voucher with the booking code, valid for twelve months from purchase.' },
  { q: 'Are walk-ins possible, or must I pre-book?',
    a: 'Pre-booking is strongly recommended; popular spas sell out evenings and weekends. Walk-ins are welcome when capacity allows, but only pre-booked guests are guaranteed their preferred therapist and time.' },
  { q: 'What should I bring and when should I arrive?',
    a: 'Arrive fifteen minutes early with comfortable clothing. Robes, slippers and towels are provided by every listed spa. For thermal circuits, bring swimwear; for facials, arrive with a clean face where possible.' },
];

/** Accounts created by the database seeder (demo/ops access). */
export const SEED_ACCOUNTS = {
  admin: { email: 'admin@bookyourspa.net', password: 'Admin@2026!', name: 'Platform Admin' },
  supplier: { email: 'owner@aurora-wellness.com', password: 'Supplier@2026!', name: 'Eleanor Whitmore', companyName: 'Aurora Wellness House Ltd' },
  customer: { email: 'anna.customer@example.com', password: 'Customer@2026!', name: 'Anna Bergström' },
};

/* ---------- helpers ---------- */

export const getSpa = (slug: string) => SPAS.find((s) => s.slug === slug);
export const getDestination = (slug: string) => DESTINATIONS.find((d) => d.slug === slug);
export const getTreatment = (slug: string) => TREATMENT_CATALOG.find((t) => t.slug === slug);
export const getPackage = (slug: string) => PACKAGE_CATALOG.find((p) => p.slug === slug);
export const spaTreatments = (spa: Spa) =>
  spa.treatments.map((t) => ({ ...getTreatment(t.slug)!, price: t.price }));
export const spaPackages = (spa: Spa) =>
  spa.packages.map((p) => ({ ...getPackage(p.slug)!, price: p.price }));
export const priceRange = (spa: Spa) => {
  const prices = spa.treatments.map((t) => t.price);
  return { min: Math.min(...prices), max: Math.max(...prices) };
};
export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
