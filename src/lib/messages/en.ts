import appEn from "./app.en";

const en = {
  meta: {
    brand: "Masar",
    tagline: "Safe, verified rides for your children",
    description:
      "Masar connects parents in the Eastern Province with verified bus and private-car drivers for school runs, tutoring, sports and one-off trips. Live tracking, pickup and drop-off alerts, and a choice of male or female drivers.",
  },
  nav: {
    home: "Home",
    forDrivers: "For drivers",
    safety: "Safety & trust",
    howItWorks: "How it works",
    pricing: "Pricing",
    faq: "FAQ",
    about: "About",
    contact: "Contact",
    findRide: "Find a ride",
    becomeDriver: "Become a driver",
    signIn: "Sign in",
    menu: "Menu",
    close: "Close menu",
  },
  demo: {
    label: "Demo",
    text: "Demo version. No real payments are processed and no real rides are booked.",
    dismiss: "Dismiss",
  },
  theme: {
    toggle: "Switch theme",
    light: "Light",
    dark: "Dark",
  },
  lang: {
    toggle: "العربية",
    label: "Switch to Arabic",
  },
  home: {
    badge: "Now serving the Eastern Province",
    title: "Safe, verified rides for your children",
    subtitle:
      "Masar links parents with bus and private-car drivers whose identity, licence and vehicle we check before they ever carry a child. Track every trip live, and know the moment your child is picked up and dropped off.",
    primaryCta: "Find a ride",
    secondaryCta: "Become a Masar driver",
    stats: [
      { value: "100%", label: "of drivers checked by a person" },
      { value: "5", label: "ways to pay, including mada" },
      { value: "6", label: "cities at launch" },
      { value: "10%", label: "platform fee, nothing hidden" },
    ],
    trust: {
      title: "Built on what parents told us they need",
      items: [
        "A driver they can trust, checked before the first trip",
        "Live tracking of the vehicle, every trip",
        "Clear prices, with no surprises at checkout",
      ],
    },
    how: {
      title: "How Masar works",
      subtitle:
        "Two sides, one simple flow. Parents find a seat; drivers fill the empty ones they already drive past.",
      parentsTitle: "For parents",
      driversTitle: "For drivers",
      parents: [
        {
          title: "Tell us where you are",
          body: "Register in a minute, drop a pin on your home with one tap, and add each of your children with their school and any notes the driver should know.",
        },
        {
          title: "Choose a driver you trust",
          body: "See who is verified, whether it is a bus or a private car, the driver's gender, available seats, the route, the price per day and what other parents said.",
        },
        {
          title: "Book exactly the days you need",
          body: "One trip, specific dates, or a whole month with any days removed. The driver accepts, you pay, and the seat is yours.",
        },
        {
          title: "Follow every trip",
          body: "Watch the vehicle move on the map and get a message when the driver sets off, arrives at your door, picks your child up and reaches the destination.",
        },
      ],
      drivers: [
        {
          title: "Get verified once",
          body: "Send your ID, licence, vehicle registration, insurance and inspection. We check them before your first booking, and parents see a verified badge.",
        },
        {
          title: "Publish your route",
          body: "Draw the route you already drive, say which districts you collect from, set your price per day and how many seats are free.",
        },
        {
          title: "Set hours that suit you",
          body: "Pick your working days and times, block the dates you are away, and change them whenever you like without breaking a booking you already accepted.",
        },
        {
          title: "Fill your empty seats",
          body: "Accept the requests that fit your route, run the trip from your phone, and keep your full price — parents pay the Masar fee on top.",
        },
      ],
    },
    safety: {
      title: "Safety is the whole point",
      subtitle:
        "Parents tell us the same thing first: “For me, safety comes before price.”",
      items: [
        {
          title: "Drivers we actually check",
          body: "National ID, a selfie against it, driving licence, police clearance, vehicle registration, insurance and periodic inspection — reviewed by a person before the driver can take a single booking.",
        },
        {
          title: "Live tracking on every trip",
          body: "Open Masar during a trip and the vehicle is there on the map with an arrival time. Share a read-only link with your spouse; it stops working when the trip ends.",
        },
        {
          title: "You know at every step",
          body: "A message when the driver sets off, when they are five minutes away, when they reach your door, when your child boards and when they arrive.",
        },
        {
          title: "Female drivers for daughters",
          body: "Filter for a female private-car driver, or a bus with a female attendant on board. Several mothers told us an attendant matters more to them than a camera.",
        },
        {
          title: "Documents that cannot quietly expire",
          body: "We watch every expiry date. When an insurance or inspection certificate lapses, that driver disappears from search until it is renewed.",
        },
        {
          title: "Honest ratings, and a way out",
          body: "Rate punctuality, safety, cleanliness and behaviour after trips. If you are not comfortable with a driver, ask for a different one and we will find you alternatives on the same route.",
        },
      ],
    },
    services: {
      title: "More than the school run",
      subtitle:
        "The school bus does not cover tutoring, sports or clubs. Masar does.",
      items: [
        {
          title: "Daily school commute",
          body: "A seat on a route that already passes your neighbourhood, every school day, with the same driver your child knows.",
          price: "From SAR 15 / day",
        },
        {
          title: "Activities and tutoring",
          body: "Lessons, sports, Quran classes and clubs — the trips that get cancelled when no parent is free to drive.",
          price: "Book single trips",
        },
        {
          title: "Private car, just your children",
          body: "The whole car for one family, with a male or female driver, when you would rather not share.",
          price: "Exclusive booking",
        },
        {
          title: "Whole-bus trips",
          body: "School field trips and company outings, priced by the size of the bus, with an attendant if you need one.",
          price: "By capacity",
        },
      ],
    },
    coverage: {
      title: "Starting in the Eastern Province",
      subtitle:
        "We are launching in the Eastern Province, then expanding across the Kingdom.",
      cities: [
        "Dammam",
        "Khobar",
        "Dhahran",
        "Al-Ahsa",
        "Qatif",
        "Jubail",
      ],
      note: "Not in your area yet? Tell us your route and we will let you know the moment a driver covers it.",
      cta: "Request your route",
    },
    pricing: {
      title: "One fee, shown before you pay",
      subtitle:
        "The driver sets their own price. Masar adds 10% and never takes a cut of what the driver earns.",
      rows: [
        { label: "22 school days, 2 children", value: "SAR 1,100", strong: false },
        { label: "Long-term discount (over 20 days, 10%)", value: "− SAR 110", strong: false },
        { label: "Driver receives", value: "SAR 990", strong: true },
        { label: "VAT (15%)", value: "+ SAR 148.50", strong: false },
        { label: "Masar service fee (10%)", value: "+ SAR 99", strong: false },
        { label: "You pay", value: "SAR 1,237.50", strong: true },
      ],
      note: "Book more than 10 school days and you save 5%. More than 20 days saves 10%. The discount comes off the driver's price before anything is added.",
    },
    testimonials: {
      title: "What people told us",
      note: "Feedback from parents and drivers across the Eastern Province.",
      items: [
        {
          quote: "I feel safer when I know the driver is verified.",
          author: "Father of three",
          where: "Al Khobar",
        },
        {
          quote: "I usually have five to eight empty seats.",
          author: "Bus driver, 6 years",
          where: "Al Khobar",
        },
        {
          quote: "The school bus does not cover tutoring or sports activities.",
          author: "Father of three",
          where: "Al Khobar",
        },
        {
          quote: "When the driver is late, I arrive late to work.",
          author: "Father of two daughters",
          where: "Dammam",
        },
      ],
    },
    faq: {
      title: "Questions parents ask",
      cta: "See all questions",
    },
    cta: {
      title: "Ready when you are",
      subtitle:
        "Find a verified driver on your route, or start earning from the seats you already drive past empty.",
      parent: "Find a ride",
      driver: "Become a driver",
    },
  },
  drivers: {
    title: "Fill the seats you already drive past empty",
    subtitle:
      "Masar brings you families on the route you already run, handles the bookings and the money, and takes a fair 10% that the parent pays on top — not out of your price.",
    cta: "Start your application",
    benefitsTitle: "Why drivers join",
    benefits: [
      {
        title: "You keep your full price",
        body: "You set your charge per day. Masar's 10% is added to what the parent pays, so the amount you quote is the amount you earn.",
      },
      {
        title: "Families on your route",
        body: "We only show you to parents whose home is genuinely near the path you already drive, so you are not crossing the city for one child.",
      },
      {
        title: "Work outside school hours",
        body: "Tutoring runs, sports clubs, field trips and company trips fill the hours when your bus would otherwise sit idle.",
      },
      {
        title: "Bookings and money in one place",
        body: "Requests, schedules, absences and payments in one app instead of scattered WhatsApp groups and Haraj posts.",
      },
      {
        title: "Hours you control",
        body: "Set your days and times, block your holidays, and change them whenever you want — Masar only stops you breaking a booking you already accepted.",
      },
      {
        title: "A reputation that pays",
        body: "Your on-time record and completed trips sit next to your rating. Drivers who turn up on time get picked first.",
      },
    ],
    requirementsTitle: "What you will need",
    requirementsNote:
      "These follow the Transport General Authority's rules for school transport. Have photos ready and the application takes about ten minutes.",
    requirements: {
      driver: {
        title: "About you",
        items: [
          "25 years old or above",
          "National ID or Iqama, valid",
          "A valid Saudi driving licence — public or heavy for buses",
          "Police clearance certificate issued in the last 12 months",
          "A clear photo of your face for your profile",
          "First-aid certificate (buses)",
        ],
      },
      vehicle: {
        title: "About your vehicle",
        items: [
          "Vehicle registration (Istimara), valid",
          "Insurance covering passenger transport",
          "Periodic technical inspection (Fahas), valid",
          "TGA operating card covering educational transport (buses)",
          "Working seat belts and air conditioning",
          "Photos of the front, back, side and interior",
        ],
      },
    },
    stepsTitle: "From application to first booking",
    steps: [
      {
        title: "Apply",
        body: "Fill in your details, upload your documents and set your price and working hours. You can save and come back.",
      },
      {
        title: "We verify",
        body: "A person checks every document. If something is missing or unclear we tell you exactly what to fix.",
      },
      {
        title: "Publish your route",
        body: "Draw the route you drive, choose the districts you collect from and the seats you have free.",
      },
      {
        title: "Start earning",
        body: "Accept the requests that suit you, run the trip from your phone, and get paid for every completed trip.",
      },
    ],
    feeTitle: "What Masar costs you",
    feeBody:
      "Nothing to join, nothing monthly. When a parent books, they pay your price plus a 10% Masar service fee. You receive your full price. Competing platforms deduct up to 15% from the driver instead.",
    feeExample: {
      title: "On a SAR 20 per day seat",
      rows: [
        { label: "Your price, 22 days", value: "SAR 440", strong: false },
        { label: "Masar fee, paid by the parent", value: "SAR 44", strong: false },
        { label: "You receive", value: "SAR 440", strong: true },
      ],
    },
  },
  safetyPage: {
    title: "Safety & trust",
    subtitle:
      "Parents put safety before price, and so do we. Here is exactly what we check, what we show you, and who can see what.",
    verificationTitle: "How we verify a driver",
    verificationBody:
      "No driver can receive a single booking until a person at Masar has reviewed each of these. We check that the name on the licence matches the ID, that the photo matches the selfie, and that nothing has expired.",
    verificationSteps: [
      {
        title: "Identity",
        body: "National ID or Iqama, front and back, plus a selfie holding it so we can confirm the person applying is the person on the document.",
      },
      {
        title: "Right to drive",
        body: "A valid Saudi driving licence — public or heavy class for anyone driving a bus — and a police clearance certificate issued within the last year.",
      },
      {
        title: "The vehicle itself",
        body: "Registration, insurance covering passenger transport, and a current periodic inspection. Buses also need a Transport General Authority operating card for educational transport.",
      },
      {
        title: "Kept current",
        body: "We track every expiry date and remind the driver 30, 14 and 3 days ahead. If a document lapses, that driver is hidden from search until it is renewed.",
      },
    ],
    duringTitle: "While your child is travelling",
    during: [
      {
        title: "Live location",
        body: "From the moment the driver starts the trip until it ends, you can see the vehicle on the map with an arrival time.",
      },
      {
        title: "Every milestone",
        body: "On the way, five minutes out, arrived at your door, child picked up, arrived at the destination — each one reaches you as it happens.",
      },
      {
        title: "Handover at drop-off",
        body: "On the way home, you can require the driver to hand your child to you or to someone you have authorised by name.",
      },
      {
        title: "SOS",
        body: "One button on the trip screen alerts Masar and your emergency contacts with the live location.",
      },
      {
        title: "Report a problem",
        body: "Raise an issue on any trip. The GPS record and the timeline come attached automatically, so most disputes settle on facts rather than memory.",
      },
    ],
    privacyTitle: "Who can see what",
    privacy: [
      {
        title: "Your driver sees",
        body: "Your child's first name, the pickup address and your notes — and only for bookings they have accepted.",
      },
      {
        title: "Other parents see",
        body: "The route of the service. Never your address, never your child's name, never the other families on the vehicle.",
      },
      {
        title: "You see",
        body: "The driver's photo, first name, rating, vehicle and plate, and that their documents are verified. Never their ID number.",
      },
      {
        title: "Masar keeps",
        body: "Identity documents in private storage that only our verification team can open, and trip location history for 30 days in case of a dispute, after which it is deleted.",
      },
    ],
    note: "Masar is a marketplace. We verify drivers and their vehicles carefully, but drivers are independent operators, not Masar employees.",
  },
  about: {
    title: "About Masar",
    lead: "Masar started from a straightforward observation: the school bus solves one trip a day, and leaves families stuck for every other one.",
    body: [
      "When we asked parents and drivers for their feedback, the same two problems came back. Parents could not find a driver they trusted, and when they did, they had no idea where the vehicle was. Drivers had empty seats and no reliable way to fill them.",
      "Masar puts those two sides on one platform. Drivers are verified before they carry anyone. Parents choose by vehicle, driver gender, route, seats and price, book exactly the days they need, and follow each trip as it happens. The platform takes 10%, paid by the parent, so the driver keeps the price they set.",
      "We are starting in the Eastern Province, where we can give the first drivers and families real attention.",
    ],
  },
  contact: {
    title: "Contact us",
    subtitle:
      "Questions about a booking, becoming a driver, or working with your school? Send us a message.",
    name: "Your name",
    email: "Email",
    phone: "Mobile number",
    topic: "What is this about?",
    topics: [
      "I am a parent",
      "I want to drive with Masar",
      "I represent a school",
      "Something else",
    ],
    message: "Your message",
    send: "Send message",
    sending: "Sending…",
    sent: "Thank you — we will reply within one working day.",
    invalid: "Please check your name, mobile number (05XXXXXXXX), email and message.",
    tooMany: "Too many messages from this device. Please try again in a few minutes.",
    failed: "We couldn't send your message. Please try again, or reach us on WhatsApp.",
    orWhatsapp: "Or message us on WhatsApp",
    otherTitle: "Other ways to reach us",
    hours: "Sunday to Thursday, 8am to 6pm",
    based: "Eastern Province, Saudi Arabia",
  },
  faq: {
    title: "Frequently asked questions",
    subtitle: "If your question is not here, contact us and we will answer it.",
    groups: [
      {
        title: "For parents",
        items: [
          {
            q: "How do you check that a driver is genuine?",
            a: "Before a driver can take any booking, a person at Masar reviews their national ID or Iqama with a selfie held against it, their driving licence, a police clearance certificate from the last twelve months, the vehicle registration, insurance and periodic inspection. Buses additionally need a Transport General Authority operating card for educational transport and a first-aid certificate. We also track every expiry date and hide a driver from search if anything lapses.",
          },
          {
            q: "Can I ask for a female driver?",
            a: "Yes. You can filter for a female driver, who will be driving a private car, or for a bus with a female attendant on board. Several mothers told us an attendant inside the vehicle mattered to them more than cameras did.",
          },
          {
            q: "How flexible is the booking?",
            a: "Very. Book a single trip, a set of specific dates, or a recurring booking across weeks or months. You can switch off any day of the week — Thursdays, for example — and remove individual dates for holidays or appointments. Within a running booking you can mark your child absent, cancel one day or move it, and the rest of the month carries on untouched.",
          },
          {
            q: "What does it cost?",
            a: "The driver sets their own daily charge, usually SAR 15 to 25 per child for a round trip. Masar adds a 10% service fee on top, and VAT is applied at the standard rate. Book more than 10 school days and the driver's price drops 5%; more than 20 days and it drops 10%. Every line is shown before you pay.",
          },
          {
            q: "What happens if the driver cannot come one day?",
            a: "You are told immediately with the reason, those trips are refunded in full including the Masar fee, and the money goes to your Masar wallet straight away. We then show you drivers who are free right now on the same route, with your refunded balance already applied, so you can book a replacement in a couple of taps. The rest of your booking continues as normal.",
          },
          {
            q: "Can I see where the vehicle is?",
            a: "Yes, from the moment the driver starts the trip until it ends. You can also send a read-only tracking link to your spouse or whoever is collecting your child; it stops working when the trip ends, even if someone forwards it.",
          },
          {
            q: "What if I am not happy with my driver?",
            a: "You can request a different driver at any point. Choose the date the change takes effect, and we show you alternative drivers on the same route so your child is never left without transport. You are refunded the driver's price for unused days; the service fee is not refunded when the change is your choice.",
          },
          {
            q: "What if I need to cancel?",
            a: "Cancel at any time. You are refunded the driver's price for unused days beyond a one-week notice period, which protects the driver's income. If Masar or the driver ends the booking instead, you are refunded in full including the fee.",
          },
        ],
      },
      {
        title: "For drivers",
        items: [
          {
            q: "What does Masar take?",
            a: "Ten percent, and the parent pays it on top of your price. You receive the full amount you quoted. There is nothing to join and no monthly fee.",
          },
          {
            q: "Do I have to accept every request?",
            a: "No. You see the family's district, the children, the days and the times, and how far they are from your route before you decide. You accept or reject each request, and you can say why.",
          },
          {
            q: "Can I change my working hours later?",
            a: "Whenever you like. The only thing Masar will not let you do is break a booking you have already accepted — in that case you can apply the new hours from a later date, or ask the affected parents whether the new time works for them.",
          },
          {
            q: "How do I get paid?",
            a: "Earnings build up per completed trip and are paid to the bank account you registered, on a regular payout run. Your earnings page shows what is owed and what has been sent.",
          },
          {
            q: "How long does verification take?",
            a: "Usually a day or two once all your documents are uploaded clearly. If something is missing we tell you exactly what to fix rather than rejecting the whole application.",
          },
        ],
      },
    ],
  },
  legal: {
    updated: "Last updated",
    demoBanner:
      "Masar is in its demo phase. These terms describe how the service works.",
    privacy: {
      title: "Privacy policy",
      intro:
        "This policy explains what Masar collects, why, who sees it, and the choices you have. It is written to align with the Saudi Personal Data Protection Law (PDPL).",
      sections: [
        {
          title: "What we collect",
          body: "From parents: your name, mobile number, email, home and other pickup addresses with their map coordinates, and details of each child you add — first name, gender, date of birth, school, and any notes or authorised collectors you choose to record. From drivers: identity and licence documents, police clearance, vehicle registration, insurance, inspection, bank details for payouts, and your vehicle's location while a trip is running. From everyone: basic technical information needed to keep the service working and secure.",
        },
        {
          title: "Why we collect it",
          body: "To verify that drivers are who they say they are and are licensed to carry children; to match families with drivers whose route genuinely suits them; to run and track bookings; to process payments and refunds; to resolve disputes; and to meet legal and regulatory obligations.",
        },
        {
          title: "Who can see it",
          body: "A driver sees a child's first name, the pickup address and your notes, and only for a booking they have accepted. Other parents never see your address, your child's name, or the other families on a vehicle. You see a driver's photo, first name, rating, vehicle and verification status, never their identity document numbers. Identity documents are stored privately and can be opened only by our verification team.",
        },
        {
          title: "Location data",
          body: "A driver's location is shared only while a trip is running, and only with the parents whose children are on that trip. Trip location history is kept for 30 days so that a dispute can be settled fairly, then deleted.",
        },
        {
          title: "How long we keep it",
          body: "Account and booking records are kept while your account is open. Financial records are kept for the period required by Saudi tax and accounting rules. Everything else is deleted when it is no longer needed for the purpose it was collected for.",
        },
        {
          title: "Your rights",
          body: "You can see the personal data we hold about you, correct it, download a copy, or ask us to delete your account. Where we rely on your consent — for notifications, for example — you can withdraw it at any time without affecting the service itself.",
        },
        {
          title: "Children's data",
          body: "Information about a child is provided by their parent or guardian and is used only to arrange and run that child's transport. It is never used for advertising and never sold.",
        },
        {
          title: "Contact",
          body: "For any question about this policy, or to exercise any of the rights above, contact us through the contact page.",
        },
      ],
    },
    terms: {
      title: "Terms of use",
      intro:
        "These terms govern the use of Masar by parents and by drivers. By creating an account you agree to them.",
      sections: [
        {
          title: "What Masar is",
          body: "Masar is a platform that connects parents with independent bus and private-car drivers. We verify drivers and their vehicles before they can accept bookings, but drivers are self-employed operators and are not employees or agents of Masar. The transport contract is between the parent and the driver.",
        },
        {
          title: "Who may use it",
          body: "Parents must be adults acting for children in their care. Drivers must be at least 25 years old, hold a valid Saudi driving licence of the correct class, provide a police clearance certificate issued within the last twelve months, and keep their vehicle registration, insurance and periodic inspection valid. Bus drivers must additionally hold a Transport General Authority operating card covering educational transport.",
        },
        {
          title: "Bookings",
          body: "A booking request is an offer to the driver, who may accept or reject it. Seats are held while the driver decides and while payment is outstanding, and are released automatically if either deadline passes. A booking is confirmed once payment is complete.",
        },
        {
          title: "Prices and the Masar fee",
          body: "Drivers set their own prices. Masar adds a service fee of 10% of the driver's price, which the parent pays on top, and VAT is applied at the rate in force. All lines are shown before payment. Long-term discounts are applied to the driver's price before the fee and VAT are calculated.",
        },
        {
          title: "Changes and cancellations",
          body: "Parents may cancel or change a booking subject to the cancellation policy. Drivers may change their working hours but not in a way that breaks a booking they have already accepted; where a change is unavoidable, affected parents are asked to agree or are refunded. Repeated last-minute cancellations by a driver affect their standing on the platform and may lead to removal.",
        },
        {
          title: "Conduct",
          body: "Drivers must carry no more children than the vehicle is licensed for, follow the agreed route and times, and behave appropriately with children at all times. Parents must have children ready at the agreed time and inform the driver of an absence as early as they can. Masar may suspend or remove any account that puts a child at risk.",
        },
        {
          title: "Disputes",
          body: "Either side may raise a dispute through the platform. We review the trip record, including GPS and timings, hear both sides, and decide. Outcomes may include a partial or full refund, a credit, compensation, a warning, suspension or removal.",
        },
        {
          title: "Liability",
          body: "Masar is responsible for operating the platform and for verifying drivers' documents as described. Masar does not drive the vehicles and is not liable for the acts of independent drivers beyond what the law requires. Nothing in these terms limits liability that cannot be limited by law.",
        },
      ],
    },
    refunds: {
      title: "Cancellation and refund policy",
      intro:
        "What you get back depends on who ends the booking. The rules below are applied the same way every time, and the exact amount is always shown before you confirm.",
      tableHeads: ["Who ends it", "Driver's price", "Masar 10% fee"],
      rows: [
        {
          who: "You cancel, or ask for a different driver",
          price:
            "Refunded for unused days beyond a 7-day notice period. Trips inside the next 7 days are still paid to the driver.",
          fee: "Not refunded",
        },
        {
          who: "The driver cancels, including a same-day emergency",
          price: "Refunded in full, with no notice deduction",
          fee: "Refunded in full",
        },
        {
          who: "Your child is absent and you tell us in time",
          price: "Credited according to the absence policy",
          fee: "Credited with it",
        },
        {
          who: "Masar ends the booking",
          price: "Refunded in full",
          fee: "Refunded in full",
        },
      ],
      sections: [
        {
          title: "Absences",
          body: "Mark your child absent at least 12 hours before pickup and that trip is credited back to you. The seat is released so the driver can use it. Later than that, the trip is charged, because the driver has already planned the route around your child.",
        },
        {
          title: "If a driver cannot come",
          body: "Those trips are refunded in full, including the Masar fee, and the money reaches your Masar wallet immediately so you can book a replacement for the same day without waiting for a card refund. You can take the refund back to your card instead if you prefer.",
        },
        {
          title: "Why the fee is kept when you cancel",
          body: "The service fee covers the work Masar has already done: verifying the driver, matching the route, holding the seat and handling the payment. When the driver or Masar ends the booking, that work has not delivered what you paid for, so the fee goes back too.",
        },
        {
          title: "How long a refund takes",
          body: "A refund to your Masar wallet is immediate. A refund to a card or bank account usually takes a few working days, depending on your bank.",
        },
      ],
    },
  },
  footer: {
    tagline: "Safe, verified rides for your children.",
    product: "Masar",
    company: "Company",
    legalTitle: "Legal",
    rights: "All rights reserved.",
  },
  common: {
    learnMore: "Learn more",
    getStarted: "Get started",
    comingSoon: "Coming soon",
    backHome: "Back to home",
    notFoundTitle: "We could not find that page",
    notFoundBody:
      "The link may be old, or the page may have moved. Try starting from the home page.",
    step: "Step",
    sample: "Sample",
  },
  app: appEn,
};

export default en;
export type Messages = typeof en;
