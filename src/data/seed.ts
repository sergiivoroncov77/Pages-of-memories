import type { AppSnapshot } from './types';

export const seedSnapshot: AppSnapshot = {
  version: 1,
  project: {
    id: 'project_family_demo',
    title: 'Наша семейная история',
    subtitle: 'Голоса четырёх близких людей',
    createdAt: '2026-08-14T10:00:00+03:00',
    inviteCode: 'FAMILY-4829'
  },
  people: [
    {
      id: 'person_anna',
      projectId: 'project_family_demo',
      name: 'Анна Петровна',
      relation: 'Бабушка',
      birthYear: 1941,
      initials: 'АП',
      avatarColor: '#b45f45',
      bio: 'Выросла в небольшом селе, много лет работала библиотекарем. Любит рассказывать о семье и старых фотографиях.',
      answeredCount: 2,
      totalQuestions: 6,
      lastActiveAt: '2026-09-22T18:30:00+03:00',
      status: 'active'
    },
    {
      id: 'person_mikhail',
      projectId: 'project_family_demo',
      name: 'Михаил Сергеевич',
      relation: 'Папа',
      birthYear: 1968,
      initials: 'МС',
      avatarColor: '#3f7180',
      bio: 'Инженер, путешественник и главный семейный фотограф. Лучше всего отвечает на вопросы о работе и поездках.',
      answeredCount: 1,
      totalQuestions: 5,
      lastActiveAt: '2026-09-28T20:15:00+03:00',
      status: 'active'
    },
    {
      id: 'person_olga',
      projectId: 'project_family_demo',
      name: 'Ольга Ивановна',
      relation: 'Мама',
      birthYear: 1971,
      initials: 'ОИ',
      avatarColor: '#6b7f4d',
      bio: 'Учитель начальных классов. Помнит своих первых учеников по именам и хранит школьные фотографии.',
      answeredCount: 1,
      totalQuestions: 4,
      lastActiveAt: '2026-09-16T17:40:00+03:00',
      status: 'active'
    },
    {
      id: 'person_dmitry',
      projectId: 'project_family_demo',
      name: 'Дмитрий Николаевич',
      relation: 'Дедушка',
      initials: 'ДН',
      avatarColor: '#8b6f45',
      bio: 'Первый рассказ ещё впереди. Начните с вопроса о доме детства.',
      answeredCount: 0,
      totalQuestions: 4,
      lastActiveAt: '2026-10-01T12:00:00+03:00',
      status: 'invited'
    }
  ],
  questions: [
    {
      id: 'question_childhood',
      personId: 'person_anna',
      text: 'Какой день из вашего детства запомнился больше всего?',
      hint: 'Не спешите. Начните с места, времени года или запаха, который помните.',
      prompts: ['Где это было?', 'Кто был рядом?', 'Что случилось в тот день?'],
      category: 'Детство',
      status: 'answered',
      order: 1
    },
    {
      id: 'question_grandpa',
      personId: 'person_anna',
      text: 'Расскажите, как вы познакомились с дедушкой.',
      hint: 'Можно начать с того, где вы учились или работали в тот год.',
      prompts: ['Кто вас представил?', 'Каким он показался сначала?', 'Что вы запомнили о первой встрече?'],
      category: 'Любовь и семья',
      status: 'next',
      order: 2
    },
    {
      id: 'question_job',
      personId: 'person_anna',
      text: 'Каким было ваше первое место работы?',
      hint: 'Расскажите, чем вы занимались в обычный рабочий день.',
      prompts: ['Как вы туда попали?', 'Что было самым трудным?', 'С кем вы работали?'],
      category: 'Работа',
      status: 'planned',
      order: 3
    },
    {
      id: 'question_heritage',
      personId: 'person_anna',
      text: 'Что важное вам передала ваша мама?',
      hint: 'Это может быть привычка, правило, умение или просто часто повторяемые слова.',
      prompts: ['Когда вы это вспоминаете?', 'Как вы передали это дальше?'],
      category: 'Семейные традиции',
      status: 'answered',
      order: 4
    },
    {
      id: 'question_travel',
      personId: 'person_mikhail',
      text: 'Какая поездка изменила ваше представление о мире?',
      hint: 'Вспомните не только место, но и людей, разговоры и неожиданные события.',
      prompts: ['Почему вы туда поехали?', 'Что оказалось совсем другим?', 'Что вы привезли с собой?'],
      category: 'Путешествия',
      status: 'answered',
      order: 1
    },
    {
      id: 'question_work',
      personId: 'person_mikhail',
      text: 'Расскажите о проекте, которым вы особенно гордитесь.',
      hint: 'Можно назвать задачу, команду и результат своими словами.',
      prompts: ['С чего всё началось?', 'Что мешало?', 'Чем всё закончилось?'],
      category: 'Работа',
      status: 'next',
      order: 2
    },
    {
      id: 'question_teacher',
      personId: 'person_olga',
      text: 'Почему вы выбрали профессию учителя?',
      hint: 'Вспомните человека или событие, после которого выбор стал понятен.',
      prompts: ['Кто повлиял на решение?', 'Были ли сомнения?', 'Что оказалось правдой о профессии?'],
      category: 'Профессия',
      status: 'answered',
      order: 1
    },
    {
      id: 'question_home',
      personId: 'person_dmitry',
      text: 'Расскажите о доме, в котором вы выросли.',
      hint: 'Опишите комнаты, двор, звуки и людей, которые там бывали.',
      prompts: ['Как выглядел ваш двор?', 'Где было ваше любимое место?', 'Кто приходил в гости?'],
      category: 'Дом',
      status: 'planned',
      order: 1
    }
  ],
  memories: [
    {
      id: 'memory_summer',
      personId: 'person_anna',
      questionId: 'question_childhood',
      title: 'Лето у бабушки в Костромской области',
      questionText: 'Какой день из вашего детства запомнился больше всего?',
      recordedAt: '2026-09-22T18:30:00+03:00',
      durationSeconds: 258,
      transcript:
        'Мне было, наверное, семь лет. Мы приехали к бабушке перед самым сенокосом. Дом стоял на краю села, а за ним сразу начинался луг. Утром я проснулась от того, что в окно падало солнце и пахло скошенной травой. Бабушка дала мне кусок хлеба с молоком, и мы пошли помогать. Меня, конечно, больше отправили собирать цветы, но мне казалось, что я делаю очень важное взрослое дело. К вечеру пришли соседи, и все сели за большой стол во дворе. Я впервые почувствовала, что у нас очень большая и дружная семья.',
      tags: ['детство', 'лето', 'село', 'семья'],
      photoUrl: '/demo/photo-porch.svg',
      photoAlt: 'Демонстрационная иллюстрация старого дома и луга',
      source: 'app',
      favorite: true
    },
    {
      id: 'memory_school',
      personId: 'person_olga',
      questionId: 'question_teacher',
      title: 'Первый класс и решение стать учителем',
      questionText: 'Почему вы выбрали профессию учителя?',
      recordedAt: '2026-09-16T17:40:00+03:00',
      durationSeconds: 196,
      transcript:
        'В четвертом классе у нас появилась новая учительница, Мария Львовна. Она умела так объяснять, что даже трудная задача становилась понятной. Но важнее было другое: она замечала, если кто-то расстроен, и никогда не делала замечание при всех. Однажды я осталась помогать ей проверять тетради и вдруг поняла, что хочу делать такую же работу. Когда пришло время выбирать институт, я уже не сомневалась. Сначала было страшно выходить к первому классу. Но когда дети начали задавать вопросы, страх прошёл. Я поняла, что хочу быть рядом в тот момент, когда у человека что-то начинает получаться.',
      tags: ['школа', 'учитель', 'профессия'],
      photoUrl: '/demo/photo-kitchen.svg',
      photoAlt: 'Демонстрационная иллюстрация дома и семейного стола',
      source: 'link',
      favorite: false
    },
    {
      id: 'memory_baikal',
      personId: 'person_mikhail',
      questionId: 'question_travel',
      title: 'Первая зима на Байкале',
      questionText: 'Какая поездка изменила ваше представление о мире?',
      recordedAt: '2026-09-28T20:15:00+03:00',
      durationSeconds: 312,
      transcript:
        'Я много видел фотографий Байкала, поэтому думал, что уже знаю, как это выглядит. Но когда мы вышли на лёд ранним утром, всё оказалось другим. Лёд гудел и трещал, будто под ногами живёт что-то огромное. Наш проводник сказал не бояться, и мы шли вдоль прозрачных торосов почти до обеда. Помню, как остановились без разговоров. Не было ни ветра, ни машин, только этот звук. Тогда я понял, что природа не является декорацией к нашей жизни. Это была хорошая проверка на скромность.',
      tags: ['поездка', 'Байкал', 'зима'],
      photoUrl: '/demo/photo-walk.svg',
      photoAlt: 'Демонстрационная иллюстрация прогулки на природе',
      source: 'app',
      favorite: false
    },
    {
      id: 'memory_mother',
      personId: 'person_anna',
      questionId: 'question_heritage',
      title: 'Слова, которые мама повторяла всегда',
      questionText: 'Что важное вам передала ваша мама?',
      recordedAt: '2026-08-30T16:10:00+03:00',
      durationSeconds: 147,
      transcript:
        'Мама часто говорила: «Сначала накорми, потом расспрашивай». Я долго думала, что это только про еду. Только потом поняла, что она учила не начинать разговор с упрёка. Если человек пришёл уставший или расстроенный, сначала нужно дать ему почувствовать, что ему здесь рады. Я старалась так встречать вас, когда вы приезжали. И теперь, когда вижу, как вы садитесь за стол, всегда вспоминаю мамины слова.',
      tags: ['мама', 'семья', 'традиции'],
      photoUrl: '',
      photoAlt: '',
      source: 'link',
      favorite: true
    }
  ],
  books: [
    {
      id: 'book_family_demo',
      projectId: 'project_family_demo',
      title: 'Наша семейная книга',
      subtitle: 'Истории, которые хочется перечитывать',
      description: 'Собрание воспоминаний семьи — с голосами, фотографиями и взглядами тех, кто был рядом.',
      createdAt: '2026-08-14T10:00:00+03:00',
      updatedAt: '2026-09-28T20:15:00+03:00',
      coverMediaAssetId: 'asset_porch'
    }
  ],
  chapters: [
    {
      id: 'chapter_childhood',
      bookId: 'book_family_demo',
      title: 'Откуда всё начинается',
      description: 'Детство, первые дома и люди, которые нас вырастили.',
      order: 1,
      createdAt: '2026-08-14T10:00:00+03:00',
      updatedAt: '2026-09-22T18:30:00+03:00'
    },
    {
      id: 'chapter_paths',
      bookId: 'book_family_demo',
      title: 'Дороги и выборы',
      description: 'Поездки, работа и решения, изменившие семейную историю.',
      order: 2,
      createdAt: '2026-08-14T10:00:00+03:00',
      updatedAt: '2026-09-28T20:15:00+03:00'
    }
  ],
  moments: [
    {
      id: 'moment_summer',
      bookId: 'book_family_demo',
      chapterId: 'chapter_childhood',
      title: 'Лето у бабушки в Костромской области',
      summary: 'Сенокос, хлеб с молоком и первое ощущение большой дружной семьи.',
      occurredAt: '1950-07-15',
      tags: ['детство', 'лето', 'семья'],
      primaryPerspectiveId: 'perspective_summer_text',
      createdAt: '2026-09-22T18:30:00+03:00',
      updatedAt: '2026-09-22T18:30:00+03:00',
      favorite: true
    },
    {
      id: 'moment_baikal',
      bookId: 'book_family_demo',
      chapterId: 'chapter_paths',
      title: 'Первая зима на Байкале',
      summary: 'Тишина прозрачного льда и поездка, научившая внимательнее смотреть на природу.',
      occurredAt: '1996-01-20',
      tags: ['путешествия', 'зима', 'Байкал'],
      primaryPerspectiveId: 'perspective_baikal_text',
      createdAt: '2026-09-28T20:15:00+03:00',
      updatedAt: '2026-09-28T20:15:00+03:00',
      favorite: false
    },
    {
      id: 'moment_table',
      bookId: 'book_family_demo',
      chapterId: 'chapter_childhood',
      title: 'Сначала накорми, потом расспрашивай',
      summary: 'Семейное правило, которое оказалось уроком заботы и гостеприимства.',
      occurredAt: '1980-05-01',
      tags: ['семья', 'традиции', 'дом'],
      primaryPerspectiveId: 'perspective_table_text',
      createdAt: '2026-08-30T16:10:00+03:00',
      updatedAt: '2026-08-30T16:10:00+03:00',
      favorite: true
    }
  ],
  perspectives: [
    {
      id: 'perspective_summer_text',
      momentId: 'moment_summer',
      authorId: 'person_anna',
      type: 'text',
      content:
        'Мне было, наверное, семь лет. Мы приехали к бабушке перед самым сенокосом. Дом стоял на краю села, а за ним сразу начинался луг. Утром я проснулась от солнца и запаха скошенной травы. К вечеру все сели за большой стол во дворе, и я впервые почувствовала, что у нас очень большая и дружная семья.',
      createdAt: '2026-09-22T18:30:00+03:00',
      isPrimary: true
    },
    {
      id: 'perspective_summer_audio',
      momentId: 'moment_summer',
      authorId: 'person_anna',
      type: 'audio',
      content: 'Оригинальная голосовая запись рассказа о лете у бабушки.',
      mediaAssetId: 'asset_summer_audio',
      createdAt: '2026-09-22T18:30:00+03:00',
      isPrimary: false
    },
    {
      id: 'perspective_summer_photo',
      momentId: 'moment_summer',
      authorId: 'person_mikhail',
      type: 'photo',
      content: 'Фотография дома, у которого начинался луг.',
      mediaAssetId: 'asset_porch',
      caption: 'Дом и лето',
      createdAt: '2026-09-23T09:00:00+03:00',
      isPrimary: false
    },
    {
      id: 'perspective_baikal_text',
      momentId: 'moment_baikal',
      authorId: 'person_mikhail',
      type: 'text',
      content:
        'Я много видел фотографий Байкала, поэтому думал, что уже знаю, как это выглядит. Но когда мы вышли на лёд ранним утром, всё оказалось другим. Лёд гудел и трещал, будто под ногами живёт что-то огромное. Тогда я понял, что природа не является декорацией к нашей жизни.',
      createdAt: '2026-09-28T20:15:00+03:00',
      isPrimary: true
    },
    {
      id: 'perspective_baikal_audio',
      momentId: 'moment_baikal',
      authorId: 'person_mikhail',
      type: 'audio',
      content: 'Голосовой фрагмент воспоминания о первой зиме на Байкале.',
      mediaAssetId: 'asset_baikal_audio',
      createdAt: '2026-09-28T20:15:00+03:00',
      isPrimary: false
    },
    {
      id: 'perspective_table_text',
      momentId: 'moment_table',
      authorId: 'person_anna',
      type: 'text',
      content:
        'Мама часто говорила: «Сначала накорми, потом расспрашивай». Только потом я поняла, что она учила не начинать разговор с упрёка. Если человек пришёл уставший или расстроенный, сначала нужно дать ему почувствовать, что ему здесь рады.',
      createdAt: '2026-08-30T16:10:00+03:00',
      isPrimary: true
    },
    {
      id: 'perspective_table_photo',
      momentId: 'moment_table',
      authorId: 'person_olga',
      type: 'photo',
      content: 'Семейный стол, за которым это правило помнят до сих пор.',
      mediaAssetId: 'asset_kitchen',
      caption: 'Семья за столом',
      createdAt: '2026-08-31T11:00:00+03:00',
      isPrimary: false
    }
  ],
  reflections: [
    {
      id: 'reflection_summer_anna',
      momentId: 'moment_summer',
      authorId: 'person_olga',
      text: 'Теперь я понимаю, почему ты всегда так любила запах скошенной травы.',
      createdAt: '2026-09-24T10:20:00+03:00'
    },
    {
      id: 'reflection_baikal_anna',
      momentId: 'moment_baikal',
      authorId: 'person_anna',
      text: 'Спасибо, что сохранил этот звук и не только фотографию поездки.',
      createdAt: '2026-09-29T08:45:00+03:00'
    },
    {
      id: 'reflection_table_olga',
      momentId: 'moment_table',
      authorId: 'person_olga',
      text: 'Это правило работает и сейчас — сначала чай, потом серьёзные разговоры.',
      createdAt: '2026-08-31T12:10:00+03:00'
    }
  ],
  mediaAssets: [
    {
      id: 'asset_porch',
      type: 'photo',
      url: '/demo/photo-porch.svg',
      mimeType: 'image/svg+xml',
      fileName: 'family-porch.svg',
      alt: 'Демонстрационная иллюстрация старого дома и луга',
      width: 1200,
      height: 800,
      createdAt: '2026-09-23T09:00:00+03:00'
    },
    {
      id: 'asset_kitchen',
      type: 'photo',
      url: '/demo/photo-kitchen.svg',
      mimeType: 'image/svg+xml',
      fileName: 'family-kitchen.svg',
      alt: 'Демонстрационная иллюстрация семейного стола',
      width: 1200,
      height: 800,
      createdAt: '2026-08-31T11:00:00+03:00'
    },
    {
      id: 'asset_summer_audio',
      type: 'audio',
      url: '/demo/summer-memory.mp3',
      mimeType: 'audio/mpeg',
      fileName: 'summer-memory.mp3',
      sizeBytes: 4250000,
      durationSeconds: 258,
      createdAt: '2026-09-22T18:30:00+03:00'
    },
    {
      id: 'asset_baikal_audio',
      type: 'audio',
      url: '/demo/baikal-memory.mp3',
      mimeType: 'audio/mpeg',
      fileName: 'baikal-memory.mp3',
      sizeBytes: 5100000,
      durationSeconds: 312,
      createdAt: '2026-09-28T20:15:00+03:00'
    }
  ],
  drafts: [],
  settings: {
    cloudBackup: false,
    allowTranscriptSharing: true,
    weeklyReminder: true,
    highContrast: false,
    theme: 'system'
  }
};

