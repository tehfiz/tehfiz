/* ═══════════════════════════════════════════════════════════════════════
   tehfiz-time.js — TehfizTime — t2
   Loaded by the teacher app and the student viewer, from
   /app/shared/tehfiz-time.js?v=t2.

   t4: zones carry their country (country, zoneSearch), so a time zone can be
   found by country; renamed cities show their current name (Kolkata).

   t3: next() passes over a lesson under way that has clearly been taught.

   t2: "my" zone can come from the app (window.tehfizMyTz — the teacher app
   passes its Settings time zone), single lessons carry a plan, a note and
   `replaces` like the next lesson does, and a replaced lesson is left out
   wherever the lesson that replaced it is.

   Time zones and lesson times, in one place so both apps agree.

   A timetable (one student, one teacher) has three parts that sit side by
   side and never replace one another:
     slots        weekly lesson days, {"1":{"t":"17:00","len":45}}, 0 = Sunday,
                  as wall times in `tz` (the teacher's zone; null = this
                  device's zone, which is how timetables saved before 0009 read)
     lessons      single lessons the teacher scheduled by hand, [{at, len}],
                  exact moments
     next_lesson  the next lesson set from Finish session (or edited on the
                  Profile or the calendar), {at, len, new, recent, old, note,
                  replaces?}, an exact moment. `replaces` is the weekly or
                  single lesson it was moved from, which is then not shown.
   occurrences() lays all three out between two moments. Two that fall on the
   same minute are one lesson: the next lesson's details win, then the single
   lesson's length, then the weekly slot's.

   No dependencies. Uses Intl only; a browser without a zone database falls
   back to this device's zone.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';
const TEHFIZ_TIME_VERSION = 't4';
const DAY = 86400000;

function deviceTz() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}
function myTz() {
  try { if (typeof window.tehfizMyTz === 'function') { const z = window.tehfizMyTz(); if (z && validTz(z)) return z; } } catch {}
  return deviceTz();
}
function validTz(tz) {
  if (!tz) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/* Wall-clock parts of a moment in a zone. */
const fmtCache = {};
function partsFmt(tz) {
  if (!fmtCache[tz]) {
    fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' });
  }
  return fmtCache[tz];
}
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function partsIn(ms, tz) {
  if (!validTz(tz)) {
    const d = new Date(ms);
    return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds(), wd: d.getDay() };
  }
  const o = {};
  partsFmt(tz).formatToParts(new Date(ms)).forEach((p) => { o[p.type] = p.value; });
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second, wd: WD[o.weekday] };
}
/* Minutes the zone is ahead of UTC at that moment. */
function offsetMin(ms, tz) {
  const p = partsIn(ms, tz);
  return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000);
}
/* The moment a wall time in a zone happens. Two passes settle DST edges. */
function zonedToMs(y, mo, d, h, mi, tz) {
  if (!validTz(tz)) return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let ms = guess - offsetMin(guess, tz) * 60000;
  ms = guess - offsetMin(ms, tz) * 60000;
  return ms;
}

/* ── words ──────────────────────────────────────────────────────────────── */
/* t4: which country each zone is in, from the tz database's own zone.tab and
   iso3166.tab (links like Asia/Calcutta resolved through tzdata), so a zone
   can be found by country ("malaysia" → Kuala Lumpur, "uae" → Dubai). */
const ZONE_CC_BY = {"AD":"Europe/Andorra","AE":"Asia/Dubai","AF":"Asia/Kabul","AG":"America/Antigua","AI":"America/Anguilla","AL":"Europe/Tirane","AM":"Asia/Yerevan","AO":"Africa/Luanda","AQ":"Antarctica/Casey Antarctica/Davis Antarctica/DumontDUrville Antarctica/Mawson Antarctica/McMurdo Antarctica/Palmer Antarctica/Rothera Antarctica/Syowa Antarctica/Troll Antarctica/Vostok","AR":"America/Argentina/La_Rioja America/Argentina/Rio_Gallegos America/Argentina/Salta America/Argentina/San_Juan America/Argentina/San_Luis America/Argentina/Tucuman America/Argentina/Ushuaia America/Buenos_Aires America/Catamarca America/Cordoba America/Jujuy America/Mendoza","AS":"Pacific/Pago_Pago","AT":"Europe/Vienna","AU":"Antarctica/Macquarie Australia/Adelaide Australia/Brisbane Australia/Broken_Hill Australia/Darwin Australia/Eucla Australia/Hobart Australia/Lindeman Australia/Lord_Howe Australia/Melbourne Australia/Perth Australia/Sydney","AW":"America/Aruba","AX":"Europe/Mariehamn","AZ":"Asia/Baku","BA":"Europe/Sarajevo","BB":"America/Barbados","BD":"Asia/Dhaka","BE":"Europe/Brussels","BF":"Africa/Ouagadougou","BG":"Europe/Sofia","BH":"Asia/Bahrain","BI":"Africa/Bujumbura","BJ":"Africa/Porto-Novo","BL":"America/St_Barthelemy","BM":"Atlantic/Bermuda","BN":"Asia/Brunei","BO":"America/La_Paz","BQ":"America/Kralendijk","BR":"America/Araguaina America/Bahia America/Belem America/Boa_Vista America/Campo_Grande America/Cuiaba America/Eirunepe America/Fortaleza America/Maceio America/Manaus America/Noronha America/Porto_Velho America/Recife America/Rio_Branco America/Santarem America/Sao_Paulo","BS":"America/Nassau","BT":"Asia/Thimphu","BW":"Africa/Gaborone","BY":"Europe/Minsk","BZ":"America/Belize","CA":"America/Blanc-Sablon America/Cambridge_Bay America/Coral_Harbour America/Creston America/Dawson America/Dawson_Creek America/Edmonton America/Fort_Nelson America/Glace_Bay America/Goose_Bay America/Halifax America/Inuvik America/Iqaluit America/Moncton America/Rankin_Inlet America/Regina America/Resolute America/St_Johns America/Swift_Current America/Toronto America/Vancouver America/Whitehorse America/Winnipeg","CC":"Indian/Cocos","CD":"Africa/Kinshasa Africa/Lubumbashi","CF":"Africa/Bangui","CG":"Africa/Brazzaville","CH":"Europe/Zurich","CI":"Africa/Abidjan","CK":"Pacific/Rarotonga","CL":"America/Coyhaique America/Punta_Arenas America/Santiago Pacific/Easter","CM":"Africa/Douala","CN":"Asia/Shanghai Asia/Urumqi","CO":"America/Bogota","CR":"America/Costa_Rica","CU":"America/Havana","CV":"Atlantic/Cape_Verde","CW":"America/Curacao","CX":"Indian/Christmas","CY":"Asia/Famagusta Asia/Nicosia","CZ":"Europe/Prague","DE":"Europe/Berlin Europe/Busingen","DJ":"Africa/Djibouti","DK":"Europe/Copenhagen","DM":"America/Dominica","DO":"America/Santo_Domingo","DZ":"Africa/Algiers","EC":"America/Guayaquil Pacific/Galapagos","EE":"Europe/Tallinn","EG":"Africa/Cairo","EH":"Africa/El_Aaiun","ER":"Africa/Asmera","ES":"Africa/Ceuta Atlantic/Canary Europe/Madrid","ET":"Africa/Addis_Ababa","FI":"Europe/Helsinki","FJ":"Pacific/Fiji","FK":"Atlantic/Stanley","FM":"Pacific/Kosrae Pacific/Ponape Pacific/Truk","FO":"Atlantic/Faeroe","FR":"Europe/Paris","GA":"Africa/Libreville","GB":"Europe/London","GD":"America/Grenada","GE":"Asia/Tbilisi","GF":"America/Cayenne","GG":"Europe/Guernsey","GH":"Africa/Accra","GI":"Europe/Gibraltar","GL":"America/Danmarkshavn America/Godthab America/Scoresbysund America/Thule","GM":"Africa/Banjul","GN":"Africa/Conakry","GP":"America/Guadeloupe","GQ":"Africa/Malabo","GR":"Europe/Athens","GS":"Atlantic/South_Georgia","GT":"America/Guatemala","GU":"Pacific/Guam","GW":"Africa/Bissau","GY":"America/Guyana","HK":"Asia/Hong_Kong","HN":"America/Tegucigalpa","HR":"Europe/Zagreb","HT":"America/Port-au-Prince","HU":"Europe/Budapest","ID":"Asia/Jakarta Asia/Jayapura Asia/Makassar Asia/Pontianak","IE":"Europe/Dublin","IL":"Asia/Jerusalem","IM":"Europe/Isle_of_Man","IN":"Asia/Calcutta","IO":"Indian/Chagos","IQ":"Asia/Baghdad","IR":"Asia/Tehran","IS":"Atlantic/Reykjavik","IT":"Europe/Rome","JE":"Europe/Jersey","JM":"America/Jamaica","JO":"Asia/Amman","JP":"Asia/Tokyo","KE":"Africa/Nairobi","KG":"Asia/Bishkek","KH":"Asia/Phnom_Penh","KI":"Pacific/Enderbury Pacific/Kiritimati Pacific/Tarawa","KM":"Indian/Comoro","KN":"America/St_Kitts","KP":"Asia/Pyongyang","KR":"Asia/Seoul","KW":"Asia/Kuwait","KY":"America/Cayman","KZ":"Asia/Almaty Asia/Aqtau Asia/Aqtobe Asia/Atyrau Asia/Oral Asia/Qostanay Asia/Qyzylorda","LA":"Asia/Vientiane","LB":"Asia/Beirut","LC":"America/St_Lucia","LI":"Europe/Vaduz","LK":"Asia/Colombo","LR":"Africa/Monrovia","LS":"Africa/Maseru","LT":"Europe/Vilnius","LU":"Europe/Luxembourg","LV":"Europe/Riga","LY":"Africa/Tripoli","MA":"Africa/Casablanca","MC":"Europe/Monaco","MD":"Europe/Chisinau","ME":"Europe/Podgorica","MF":"America/Marigot","MG":"Indian/Antananarivo","MH":"Pacific/Kwajalein Pacific/Majuro","MK":"Europe/Skopje","ML":"Africa/Bamako","MM":"Asia/Rangoon","MN":"Asia/Hovd Asia/Ulaanbaatar","MO":"Asia/Macau","MP":"Pacific/Saipan","MQ":"America/Martinique","MR":"Africa/Nouakchott","MS":"America/Montserrat","MT":"Europe/Malta","MU":"Indian/Mauritius","MV":"Indian/Maldives","MW":"Africa/Blantyre","MX":"America/Bahia_Banderas America/Cancun America/Chihuahua America/Ciudad_Juarez America/Hermosillo America/Matamoros America/Mazatlan America/Merida America/Mexico_City America/Monterrey America/Ojinaga America/Tijuana","MY":"Asia/Kuala_Lumpur Asia/Kuching","MZ":"Africa/Maputo","NA":"Africa/Windhoek","NC":"Pacific/Noumea","NE":"Africa/Niamey","NF":"Pacific/Norfolk","NG":"Africa/Lagos","NI":"America/Managua","NL":"Europe/Amsterdam","NO":"Europe/Oslo","NP":"Asia/Katmandu","NR":"Pacific/Nauru","NU":"Pacific/Niue","NZ":"Pacific/Auckland Pacific/Chatham","OM":"Asia/Muscat","PA":"America/Panama","PE":"America/Lima","PF":"Pacific/Gambier Pacific/Marquesas Pacific/Tahiti","PG":"Pacific/Bougainville Pacific/Port_Moresby","PH":"Asia/Manila","PK":"Asia/Karachi","PL":"Europe/Warsaw","PM":"America/Miquelon","PN":"Pacific/Pitcairn","PR":"America/Puerto_Rico","PS":"Asia/Gaza Asia/Hebron","PT":"Atlantic/Azores Atlantic/Madeira Europe/Lisbon","PW":"Pacific/Palau","PY":"America/Asuncion","QA":"Asia/Qatar","RE":"Indian/Reunion","RO":"Europe/Bucharest","RS":"Europe/Belgrade","RU":"Asia/Anadyr Asia/Barnaul Asia/Chita Asia/Irkutsk Asia/Kamchatka Asia/Khandyga Asia/Krasnoyarsk Asia/Magadan Asia/Novokuznetsk Asia/Novosibirsk Asia/Omsk Asia/Sakhalin Asia/Srednekolymsk Asia/Tomsk Asia/Ust-Nera Asia/Vladivostok Asia/Yakutsk Asia/Yekaterinburg Europe/Astrakhan Europe/Kaliningrad Europe/Kirov Europe/Moscow Europe/Samara Europe/Saratov Europe/Ulyanovsk Europe/Volgograd","RW":"Africa/Kigali","SA":"Asia/Riyadh","SB":"Pacific/Guadalcanal","SC":"Indian/Mahe","SD":"Africa/Khartoum","SE":"Europe/Stockholm","SG":"Asia/Singapore","SH":"Atlantic/St_Helena","SI":"Europe/Ljubljana","SJ":"Arctic/Longyearbyen","SK":"Europe/Bratislava","SL":"Africa/Freetown","SM":"Europe/San_Marino","SN":"Africa/Dakar","SO":"Africa/Mogadishu","SR":"America/Paramaribo","SS":"Africa/Juba","ST":"Africa/Sao_Tome","SV":"America/El_Salvador","SX":"America/Lower_Princes","SY":"Asia/Damascus","SZ":"Africa/Mbabane","TC":"America/Grand_Turk","TD":"Africa/Ndjamena","TF":"Indian/Kerguelen","TG":"Africa/Lome","TH":"Asia/Bangkok","TJ":"Asia/Dushanbe","TK":"Pacific/Fakaofo","TL":"Asia/Dili","TM":"Asia/Ashgabat","TN":"Africa/Tunis","TO":"Pacific/Tongatapu","TR":"Europe/Istanbul","TT":"America/Port_of_Spain","TV":"Pacific/Funafuti","TW":"Asia/Taipei","TZ":"Africa/Dar_es_Salaam","UA":"Europe/Kiev Europe/Simferopol","UG":"Africa/Kampala","UM":"Pacific/Midway Pacific/Wake","US":"America/Adak America/Anchorage America/Boise America/Chicago America/Denver America/Detroit America/Indiana/Knox America/Indiana/Marengo America/Indiana/Petersburg America/Indiana/Tell_City America/Indiana/Vevay America/Indiana/Vincennes America/Indiana/Winamac America/Indianapolis America/Juneau America/Kentucky/Monticello America/Los_Angeles America/Louisville America/Menominee America/Metlakatla America/New_York America/Nome America/North_Dakota/Beulah America/North_Dakota/Center America/North_Dakota/New_Salem America/Phoenix America/Sitka America/Yakutat Pacific/Honolulu","UY":"America/Montevideo","UZ":"Asia/Samarkand Asia/Tashkent","VA":"Europe/Vatican","VC":"America/St_Vincent","VE":"America/Caracas","VG":"America/Tortola","VI":"America/St_Thomas","VN":"Asia/Saigon","VU":"Pacific/Efate","WF":"Pacific/Wallis","WS":"Pacific/Apia","YE":"Asia/Aden","YT":"Indian/Mayotte","ZA":"Africa/Johannesburg","ZM":"Africa/Lusaka","ZW":"Africa/Harare"};
const CC_NAME = {"AD":"Andorra","AE":"United Arab Emirates","AF":"Afghanistan","AG":"Antigua & Barbuda","AI":"Anguilla","AL":"Albania","AM":"Armenia","AO":"Angola","AQ":"Antarctica","AR":"Argentina","AS":"American Samoa","AT":"Austria","AU":"Australia","AW":"Aruba","AX":"Åland Islands","AZ":"Azerbaijan","BA":"Bosnia & Herzegovina","BB":"Barbados","BD":"Bangladesh","BE":"Belgium","BF":"Burkina Faso","BG":"Bulgaria","BH":"Bahrain","BI":"Burundi","BJ":"Benin","BL":"St Barthelemy","BM":"Bermuda","BN":"Brunei","BO":"Bolivia","BQ":"Caribbean NL","BR":"Brazil","BS":"Bahamas","BT":"Bhutan","BW":"Botswana","BY":"Belarus","BZ":"Belize","CA":"Canada","CC":"Cocos (Keeling) Islands","CD":"Congo (DRC)","CF":"Central African Rep.","CG":"Congo","CH":"Switzerland","CI":"Côte d’Ivoire","CK":"Cook Islands","CL":"Chile","CM":"Cameroon","CN":"China","CO":"Colombia","CR":"Costa Rica","CU":"Cuba","CV":"Cape Verde","CW":"Curaçao","CX":"Christmas Island","CY":"Cyprus","CZ":"Czech Republic","DE":"Germany","DJ":"Djibouti","DK":"Denmark","DM":"Dominica","DO":"Dominican Republic","DZ":"Algeria","EC":"Ecuador","EE":"Estonia","EG":"Egypt","EH":"Western Sahara","ER":"Eritrea","ES":"Spain","ET":"Ethiopia","FI":"Finland","FJ":"Fiji","FK":"Falkland Islands","FM":"Micronesia","FO":"Faroe Islands","FR":"France","GA":"Gabon","GB":"United Kingdom","GD":"Grenada","GE":"Georgia","GF":"French Guiana","GG":"Guernsey","GH":"Ghana","GI":"Gibraltar","GL":"Greenland","GM":"Gambia","GN":"Guinea","GP":"Guadeloupe","GQ":"Equatorial Guinea","GR":"Greece","GS":"South Georgia & the South Sandwich Islands","GT":"Guatemala","GU":"Guam","GW":"Guinea-Bissau","GY":"Guyana","HK":"Hong Kong","HN":"Honduras","HR":"Croatia","HT":"Haiti","HU":"Hungary","ID":"Indonesia","IE":"Ireland","IL":"Israel","IM":"Isle of Man","IN":"India","IO":"British Indian Ocean Territory","IQ":"Iraq","IR":"Iran","IS":"Iceland","IT":"Italy","JE":"Jersey","JM":"Jamaica","JO":"Jordan","JP":"Japan","KE":"Kenya","KG":"Kyrgyzstan","KH":"Cambodia","KI":"Kiribati","KM":"Comoros","KN":"St Kitts & Nevis","KP":"North Korea","KR":"South Korea","KW":"Kuwait","KY":"Cayman Islands","KZ":"Kazakhstan","LA":"Laos","LB":"Lebanon","LC":"St Lucia","LI":"Liechtenstein","LK":"Sri Lanka","LR":"Liberia","LS":"Lesotho","LT":"Lithuania","LU":"Luxembourg","LV":"Latvia","LY":"Libya","MA":"Morocco","MC":"Monaco","MD":"Moldova","ME":"Montenegro","MF":"St Martin (French)","MG":"Madagascar","MH":"Marshall Islands","MK":"North Macedonia","ML":"Mali","MM":"Myanmar","MN":"Mongolia","MO":"Macau","MP":"Northern Mariana Islands","MQ":"Martinique","MR":"Mauritania","MS":"Montserrat","MT":"Malta","MU":"Mauritius","MV":"Maldives","MW":"Malawi","MX":"Mexico","MY":"Malaysia","MZ":"Mozambique","NA":"Namibia","NC":"New Caledonia","NE":"Niger","NF":"Norfolk Island","NG":"Nigeria","NI":"Nicaragua","NL":"Netherlands","NO":"Norway","NP":"Nepal","NR":"Nauru","NU":"Niue","NZ":"New Zealand","OM":"Oman","PA":"Panama","PE":"Peru","PF":"French Polynesia","PG":"Papua New Guinea","PH":"Philippines","PK":"Pakistan","PL":"Poland","PM":"St Pierre & Miquelon","PN":"Pitcairn","PR":"Puerto Rico","PS":"Palestine","PT":"Portugal","PW":"Palau","PY":"Paraguay","QA":"Qatar","RE":"Réunion","RO":"Romania","RS":"Serbia","RU":"Russia","RW":"Rwanda","SA":"Saudi Arabia","SB":"Solomon Islands","SC":"Seychelles","SD":"Sudan","SE":"Sweden","SG":"Singapore","SH":"St Helena","SI":"Slovenia","SJ":"Svalbard & Jan Mayen","SK":"Slovakia","SL":"Sierra Leone","SM":"San Marino","SN":"Senegal","SO":"Somalia","SR":"Suriname","SS":"South Sudan","ST":"Sao Tome & Principe","SV":"El Salvador","SX":"St Maarten (Dutch)","SY":"Syria","SZ":"Eswatini","TC":"Turks & Caicos Islands","TD":"Chad","TF":"French S. Terr.","TG":"Togo","TH":"Thailand","TJ":"Tajikistan","TK":"Tokelau","TL":"East Timor","TM":"Turkmenistan","TN":"Tunisia","TO":"Tonga","TR":"Turkey","TT":"Trinidad & Tobago","TV":"Tuvalu","TW":"Taiwan","TZ":"Tanzania","UA":"Ukraine","UG":"Uganda","UM":"US minor outlying islands","US":"United States","UY":"Uruguay","UZ":"Uzbekistan","VA":"Vatican City","VC":"St Vincent","VE":"Venezuela","VG":"British Virgin Islands","VI":"US Virgin Islands","VN":"Vietnam","VU":"Vanuatu","WF":"Wallis & Futuna","WS":"Samoa","YE":"Yemen","YT":"Mayotte","ZA":"South Africa","ZM":"Zambia","ZW":"Zimbabwe"};
const CC_ALIAS = {"GB":"uk britain great britain england scotland wales northern ireland","US":"usa us america united states of america","AE":"uae emirates","SA":"ksa saudi","RU":"russian federation","IR":"persia","NL":"holland","CZ":"czechia","TR":"turkiye","CI":"ivory coast cote d'ivoire","MM":"burma","SZ":"swaziland","KR":"korea","KP":"korea","PS":"palestinian territories","TW":"taiwan","CN":"prc","BA":"bosnia"};
let _zcc = null;
function zoneCc(tz) {
  if (!_zcc) { _zcc = {}; Object.keys(ZONE_CC_BY).forEach((c) => ZONE_CC_BY[c].split(' ').forEach((z) => { _zcc[z] = c; })); }
  return _zcc[tz] || '';
}
function country(tz) { const c = zoneCc(tz); return c ? CC_NAME[c] || '' : ''; }
// Zones the tz database has renamed, shown by today's name.
const RENAMED = { Calcutta: 'Kolkata', Saigon: 'Ho Chi Minh', Rangoon: 'Yangon', Kiev: 'Kyiv', Katmandu: 'Kathmandu',
  Godthab: 'Nuuk', Ulan_Bator: 'Ulaanbaatar', Faeroe: 'Faroe', Buenos_Aires: 'Buenos Aires', Asmera: 'Asmara' };
/* Everything a zone can be found by: its name, city (old and new), region,
   country and the country's other names. Lower case. */
function zoneSearch(tz) {
  const c = zoneCc(tz), last = String(tz || '').split('/').pop();
  return [tz, city(tz), last.replace(/_/g, ' '), String(tz || '').split('/')[0], c ? CC_NAME[c] : '', c ? CC_ALIAS[c] || '' : ''].join(' ').toLowerCase();
}
/* How well a zone matches what was typed: 3 a whole word ("india", "uk"),
   2 the start of a word ("mala"), 1 anywhere, 0 not at all. */
function zoneScore(tz, q) {
  const n = String(q || '').trim().toLowerCase();
  if (!n) return 1;
  const s = zoneSearch(tz);
  if (!s.includes(n)) return 0;
  const words = s.split(/[\s/]+/);
  if (words.includes(n) || (' ' + s + ' ').includes(' ' + n + ' ')) return 3;
  return words.some((w) => w.startsWith(n)) || (' ' + s).includes(' ' + n) ? 2 : 1;
}
function city(tz) {
  if (!tz) return '';
  const last = String(tz).split('/').pop();
  return (RENAMED[last] || last).replace(/_/g, ' ');
}
function gmt(ms, tz) {
  const m = offsetMin(ms, tz), s = m < 0 ? '−' : '+', a = Math.abs(m);
  return 'GMT' + s + Math.floor(a / 60) + (a % 60 ? ':' + String(a % 60).padStart(2, '0') : '');
}
/* "London (GMT+0)" */
function tzLabel(tz, ms) { return tz ? city(tz) + ' (' + gmt(ms || Date.now(), tz) + ')' : ''; }
/* "5 hours behind you", "the same time as you", "30 min ahead of you" */
function diffText(tz, ms, from) {
  const t = ms || Date.now();
  const d = offsetMin(t, tz) - offsetMin(t, from || myTz());
  if (!d) return 'the same time as you';
  const a = Math.abs(d), h = Math.floor(a / 60), m = a % 60;
  const amt = (h ? h + ' hour' + (h === 1 ? '' : 's') : '') + (h && m ? ' ' : '') + (m ? m + ' min' : '');
  return amt + (d < 0 ? ' behind you' : ' ahead of you');
}
function sameOffset(a, b, ms) { return offsetMin(ms || Date.now(), a) === offsetMin(ms || Date.now(), b); }

function timeText(ms, tz) {
  try { return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', ...(validTz(tz) ? { timeZone: tz } : {}) }); }
  catch { return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
}
/* "Today", "Tomorrow" or "Mon 9 Nov", for that zone's calendar. */
function dayText(ms, tz, now) {
  const a = partsIn(now || Date.now(), tz), b = partsIn(ms, tz);
  const n = Math.round((Date.UTC(b.y, b.mo - 1, b.d) - Date.UTC(a.y, a.mo - 1, a.d)) / DAY);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  try { return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(validTz(tz) ? { timeZone: tz } : {}) }); }
  catch { return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }
}
/* "Tomorrow · 5:00 PM" */
function whenText(ms, tz, now) { return dayText(ms, tz, now) + ' · ' + timeText(ms, tz); }
function weekdayShort(ms, tz) {
  try { return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', ...(validTz(tz) ? { timeZone: tz } : {}) }); }
  catch { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(ms).getDay()]; }
}

/* Zones to choose from: the browser's full list where it has one. */
let zoneList = null;
function zones() {
  if (zoneList) return zoneList;
  let z = [];
  try { if (Intl.supportedValuesOf) z = Intl.supportedValuesOf('timeZone'); } catch {}
  if (!z.length) z = ['UTC', 'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'America/Chicago', 'America/Los_Angeles', 'America/New_York',
    'America/Toronto', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Jakarta', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Kuala_Lumpur', 'Asia/Riyadh',
    'Asia/Singapore', 'Australia/Sydney', 'Europe/Berlin', 'Europe/Istanbul', 'Europe/London', 'Europe/Paris'];
  zoneList = z.slice().sort();
  return zoneList;
}

/* ── lessons ────────────────────────────────────────────────────────────── */
function slotAt(slots, wd) { return slots ? (slots[wd] || slots[String(wd)] || null) : null; }

/* Every lesson of one timetable that STARTS between `from` and `to` (ms). */
function occurrences(tt, from, to) {
  if (!tt) return [];
  const tz = validTz(tt.tz) ? tt.tz : myTz();
  const byMs = new Map();
  // Moments some other lesson was moved away from — wherever that lesson now is.
  const gone = new Set();
  const noteGone = (x) => { const r = x && x.replaces ? Date.parse(x.replaces) : NaN; if (Number.isFinite(r) && r !== Date.parse(x.at)) gone.add(r); };
  (Array.isArray(tt.lessons) ? tt.lessons : []).forEach(noteGone);
  noteGone(tt.next_lesson);
  const add = (o) => {
    const prev = byMs.get(o.at);
    if (!prev) { byMs.set(o.at, o); return; }
    const rank = { set: 3, single: 2, weekly: 1 };
    const hi = rank[o.kind] > rank[prev.kind] ? o : prev, lo = hi === o ? prev : o;
    byMs.set(o.at, { ...lo, ...hi, len: hi.len || lo.len, also: (prev.also || []).concat(prev.kind, o.kind).filter((k) => k !== hi.kind) });
  };
  // weekly: walk the days in the slots' own zone
  if (tt.slots && Object.keys(tt.slots).length) {
    const p0 = partsIn(from - DAY, tz);
    for (let i = 0; i <= Math.ceil((to - from) / DAY) + 2; i++) {
      const base = Date.UTC(p0.y, p0.mo - 1, p0.d + i);
      const dd = new Date(base), wd = dd.getUTCDay();
      const s = slotAt(tt.slots, wd);
      if (!s || !/^\d{1,2}:\d{2}$/.test(String(s.t || ''))) continue;
      const [h, m] = String(s.t).split(':').map(Number);
      const at = zonedToMs(dd.getUTCFullYear(), dd.getUTCMonth() + 1, dd.getUTCDate(), h, m, tz);
      if (at >= from && at < to && !gone.has(at)) add({ at, len: +s.len || 0, kind: 'weekly', wd });
    }
  }
  (Array.isArray(tt.lessons) ? tt.lessons : []).forEach((l) => {
    const at = Date.parse(l && l.at);
    if (Number.isFinite(at) && at >= from && at < to && !gone.has(at)) {
      add({ at, len: +l.len || 0, kind: 'single', orig: l.at, ...(l.plan ? { plan: l.plan } : {}), ...(l.note ? { note: l.note } : {}),
            ...(l.replaces ? { replaces: l.replaces } : {}) });
    }
  });
  const n = tt.next_lesson;
  if (n && n.at) {
    const at = Date.parse(n.at);
    if (Number.isFinite(at) && at >= from && at < to) {
      add({ at, len: +n.len || 0, kind: 'set', new: n.new || '', recent: n.recent || '', old: n.old || '', note: n.note || '',
            ...(n.plan ? { plan: n.plan } : {}), ...(n.replaces ? { replaces: n.replaces } : {}) });
    }
  }
  return [...byMs.values()].sort((a, b) => a.at - b.at);
}
/* The next lesson that has not finished yet (one under way still counts).
   t3: one that has already started is passed over when it has clearly been
   taught — a next lesson was set for later than it (Finish session does
   that after the session), or `done` (session start times, ms) has a session
   within 3 hours of it. */
function next(tt, now, done) {
  const t = now || Date.now();
  const list = occurrences(tt, t - 4 * 3600000, t + 15 * DAY);
  const set = tt && tt.next_lesson ? Date.parse(tt.next_lesson.at) : NaN;
  return list.find((o) => {
    if (o.at + Math.max(o.len || 30, 1) * 60000 <= t) return false;
    if (o.at <= t && o.kind !== 'set') {
      if (Number.isFinite(set) && set > o.at) return false;
      if (Array.isArray(done) && done.some((d) => d <= t && Math.abs(d - o.at) <= 3 * 3600000)) return false;
    }
    return true;
  }) || null;
}
/* A weekly slot as wall time somewhere else: {wd, t, dayShift} for the zone
   `to`, using its next occurrence (so DST is the one in force then). */
function slotIn(wd, t, fromTz, toTz, now) {
  const tt = { slots: { [wd]: { t, len: 0 } }, tz: fromTz };
  const o = occurrences(tt, now || Date.now(), (now || Date.now()) + 8 * DAY)[0];
  if (!o) return null;
  const p = partsIn(o.at, toTz);
  return { at: o.at, wd: p.wd, t: String(p.h).padStart(2, '0') + ':' + String(p.mi).padStart(2, '0'), dayShift: p.wd !== +wd };
}

/* What a lesson covers, in a line: its plan if it has one ("New p. 37 ·
   Recent Juz 2 · Spot test Juz 1"), else the older New/Recent/Old text.
   `stage` names a stage id (the apps pass sessionTypeLabel). */
function planText(o, stage) {
  if (!o) return '';
  const lab = (id) => (typeof stage === 'function' ? stage(id) : id);
  if (Array.isArray(o.plan) && o.plan.length) {
    return o.plan.map((s) => (s.mode === 'spot' ? 'Spot test ' : (s.type && s.type !== 'unassigned' ? lab(s.type) + ' ' : '')) +
      (s.label || s.text || (s.start ? s.start + '\u2013' + s.end : ''))).join(' \u00b7 ');
  }
  return [['New', o.new], ['Recent', o.recent], ['Old', o.old]].filter(([, v]) => v).map(([k, v]) => k + ' ' + v).join(' \u00b7 ');
}
/* An older lesson's New/Recent/Old text as a plan, so one editor handles both. */
function planOf(o) {
  if (!o) return [];
  if (Array.isArray(o.plan)) return o.plan.map((s) => ({ ...s }));
  return [['new', o.new], ['recent', o.recent], ['old', o.old]].filter(([, v]) => v && String(v).trim())
    .map(([type, v]) => ({ type, mode: 'recite', text: String(v).trim() }));
}

window.TehfizTime = { myTz, deviceTz, planText, planOf, validTz, partsIn, offsetMin, zonedToMs, city, country, zoneSearch, zoneScore, tzLabel, diffText, sameOffset,
  timeText, dayText, whenText, weekdayShort, zones, occurrences, next, slotIn, version: TEHFIZ_TIME_VERSION };
})();
