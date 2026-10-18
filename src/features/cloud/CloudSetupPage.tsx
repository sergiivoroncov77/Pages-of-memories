import { Check, Copy, ExternalLink, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';
import { copyText } from '../../lib/shareFile';
import scriptSource from '../../../server/google-apps-script/Code.gs?raw';
import manifestSource from '../../../server/google-apps-script/appsscript.json?raw';

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  return (
    <button type="button" className="button button--secondary button--small" onClick={async () => {
      setCopied(await copyText(text));
      window.setTimeout(() => setCopied(null), 2400);
    }}>
      {copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />} {copied ? 'Скопировано' : copied === false ? 'Не удалось — выделите текст ниже' : label}
    </button>
  );
}

/** Step-by-step installation of the storage script into the owner's Google account. */
export function CloudSetupPage() {
  return (
    <div className="page cloud-setup">
      <PageHeader eyebrow="Семейное хранилище" title="Установка на ваш Google Диск" backTo="/settings"
        description="Один раз, около 10 минут. Удобнее на компьютере, но можно и с телефона в Chrome (включите «Версию для ПК»)." />

      <Card tone="sage" className="privacy-note">
        <ShieldCheck size={26} aria-hidden="true" />
        <div>
          <h2>Что получает скрипт</h2>
          <p>Скрипт работает от вашего имени и видит только файлы, которые создал сам, — папку «Истории близких» на вашем Диске. Ваша почта, фото и остальные файлы ему недоступны. Близкие попадают в книгу только по ссылке-приглашению.</p>
        </div>
      </Card>

      <ol className="setup-steps">
        <li>
          <h2>Создайте проект</h2>
          <p>Откройте <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer" className="text-link">script.google.com <ExternalLink size={14} aria-hidden="true" /></a> под своим аккаунтом Google. Откроется новый проект — назовите его, например, «Истории близких».</p>
        </li>
        <li>
          <h2>Вставьте код</h2>
          <p>В файле <code>Code.gs</code> удалите всё и вставьте код скрипта. Сохраните: значок дискеты или Ctrl+S.</p>
          <CopyButton text={scriptSource} label="Скопировать код скрипта" />
          <details className="setup-code"><summary>Показать код</summary><pre>{scriptSource}</pre></details>
        </li>
        <li>
          <h2>Замените манифест</h2>
          <p>Слева «Настройки проекта» (шестерёнка) → отметьте «Показывать файл манифеста appsscript.json в редакторе». Вернитесь в «Редактор» (значок &lt;&gt;), откройте <code>appsscript.json</code>, замените всё содержимое и сохраните. Манифест ограничивает права скрипта только его собственными файлами.</p>
          <CopyButton text={manifestSource} label="Скопировать манифест" />
          <details className="setup-code"><summary>Показать манифест</summary><pre>{manifestSource}</pre></details>
        </li>
        <li>
          <h2>Разрешите доступ</h2>
          <p>Вверху выберите функцию <code>setup</code> и нажмите «Выполнить». Google попросит разрешение: «Проверить разрешения» → ваш аккаунт → «Дополнительные настройки» (Advanced) → «Перейти на страницу проекта (небезопасно)» → «Разрешить».</p>
          <p>Предупреждение «приложение не проверено» Google показывает для любого личного скрипта — это ваш собственный код. В журнале выполнения появится ссылка на папку хранилища.</p>
        </li>
        <li>
          <h2>Опубликуйте как веб-приложение</h2>
          <p>«Начать развертывание» (Deploy) → «Новое развертывание» → значок шестерёнки «Выберите тип» → «Веб-приложение». Проверьте:</p>
          <ul>
            <li>«Выполнять от имени» (Execute as) — <strong>«Я»</strong>, ваш адрес;</li>
            <li>«У кого есть доступ» (Who has access) — <strong>«Все»</strong> (Anyone), не «Все с аккаунтом Google».</li>
          </ul>
          <p>Нажмите «Начать развертывание» и скопируйте <strong>URL веб-приложения</strong> — он заканчивается на <code>/exec</code>.</p>
        </li>
        <li>
          <h2>Подключите приложение</h2>
          <p>На своём телефоне, планшете или компьютере: <Link to="/settings#cloud" className="text-link">«Настройки» → «Семейное хранилище»</Link>, вставьте адрес и нажмите «Подключить». Это устройство станет устройством владельца. Затем откройте книгу и нажмите «Сохранить в Google Диск».</p>
        </li>
      </ol>

      <Card className="settings-section">
        <h2>Если что-то пошло не так</h2>
        <ul className="setup-faq">
          <li><strong>«Хранилище не отвечает».</strong> Проверьте, что адрес заканчивается на <code>/exec</code> и что в развертывании выбрано «У кого есть доступ: Все».</li>
          <li><strong>Обновили код скрипта.</strong> «Начать развертывание» → «Управление развертываниями» → карандаш → «Версия: новая версия» → «Развернуть». Адрес не изменится.</li>
          <li><strong>Потеряли устройство владельца или очистили браузер.</strong> Выберите в редакторе функцию <code>resetOwner</code> и нажмите «Выполнить», затем подключите приложение заново по тому же адресу. Все книги сохранятся.</li>
          <li><strong>Где лежат файлы.</strong> На вашем Google Диске в папке «Истории близких — семейное хранилище»: по папке на книгу, внутри <code>book.json</code> и папка с фото, голосом и видео. Удалённое 30 дней лежит в корзине Диска.</li>
          <li><strong>Сколько места.</strong> Бесплатно 15 ГБ на всё в аккаунте Google, вместе с почтой и Google Фото.</li>
        </ul>
      </Card>
    </div>
  );
}
