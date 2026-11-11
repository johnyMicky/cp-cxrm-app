// Smart lead-file reader.
// Reads CSV / TSV / TXT / XLSX / XLS / ODS files with any header names, any
// column order, logo/blank rows above the header, or no header at all, and
// works out which column is name / phone / email / country / source / ...
// Everything runs locally in the browser — no AI, no network request.

import * as XLSX from 'xlsx';

export type ImportRole =
  | 'name'
  | 'first_name'
  | 'middle_name'
  | 'last_name'
  | 'email'
  | 'phone'
  | 'phone2'
  | 'dial_code'
  | 'country'
  | 'source'
  | 'status'
  | 'assigned_to'
  | 'notes'
  | 'extra'
  | 'ignore';

export const ROLE_OPTIONS: Array<{ value: ImportRole; label: string }> = [
  { value: 'name', label: 'Full Name' },
  { value: 'first_name', label: 'First Name' },
  { value: 'middle_name', label: 'Middle Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'phone2', label: 'Second Phone (backup)' },
  { value: 'dial_code', label: 'Country Dial Code (+44)' },
  { value: 'email', label: 'Email' },
  { value: 'country', label: 'Country' },
  { value: 'source', label: 'Source' },
  { value: 'status', label: 'Status' },
  { value: 'assigned_to', label: 'Assigned Agent' },
  { value: 'notes', label: 'Notes / Comment' },
  { value: 'extra', label: 'Save into Note (with title)' },
  { value: 'ignore', label: "Don't import" }
];

// Only one column can hold these roles (the rest are multi-column).
const SINGLE_ROLES: ImportRole[] = [
  'name', 'first_name', 'middle_name', 'last_name', 'email', 'phone',
  'dial_code', 'country', 'source', 'status', 'assigned_to'
];

// ---------------------------------------------------------------------------
// Phone → country (moved here unchanged from LeadImport.tsx)
// ---------------------------------------------------------------------------

// Lightweight local country detection for imports.
// It runs only once per uploaded row and makes no API/network request.
export const CANADA_NANP_AREA_CODES = new Set([
  '204','226','236','249','250','257','263','289','306','343','354','365','367',
  '368','382','403','416','418','428','431','437','438','450','468','474','506',
  '514','519','548','579','581','584','587','604','613','639','647','672','683',
  '705','709','742','753','778','780','782','807','819','825','867','873','879',
  '902','905'
]);

export const NANP_TERRITORIES: Record<string, string> = {
  '242': 'Bahamas',
  '246': 'Barbados',
  '264': 'Anguilla',
  '268': 'Antigua and Barbuda',
  '284': 'British Virgin Islands',
  '340': 'US Virgin Islands',
  '345': 'Cayman Islands',
  '441': 'Bermuda',
  '473': 'Grenada',
  '649': 'Turks and Caicos Islands',
  '658': 'Jamaica',
  '664': 'Montserrat',
  '721': 'Sint Maarten',
  '758': 'Saint Lucia',
  '767': 'Dominica',
  '784': 'Saint Vincent and the Grenadines',
  '787': 'Puerto Rico',
  '809': 'Dominican Republic',
  '829': 'Dominican Republic',
  '849': 'Dominican Republic',
  '868': 'Trinidad and Tobago',
  '869': 'Saint Kitts and Nevis',
  '876': 'Jamaica',
  '939': 'Puerto Rico'
};

export const COUNTRY_CALLING_CODES: Array<[string, string]> = [
  ['998','Uzbekistan'],['996','Kyrgyzstan'],['995','Georgia'],['994','Azerbaijan'],
  ['993','Turkmenistan'],['992','Tajikistan'],['977','Nepal'],['976','Mongolia'],
  ['975','Bhutan'],['974','Qatar'],['973','Bahrain'],['972','Israel'],['971','United Arab Emirates'],
  ['970','Palestine'],['968','Oman'],['967','Yemen'],['966','Saudi Arabia'],['965','Kuwait'],
  ['964','Iraq'],['963','Syria'],['962','Jordan'],['961','Lebanon'],['960','Maldives'],
  ['886','Taiwan'],['880','Bangladesh'],['856','Laos'],['855','Cambodia'],['853','Macau'],
  ['852','Hong Kong'],['850','North Korea'],['692','Marshall Islands'],['691','Micronesia'],
  ['690','Tokelau'],['689','French Polynesia'],['688','Tuvalu'],['687','New Caledonia'],
  ['686','Kiribati'],['685','Samoa'],['683','Niue'],['682','Cook Islands'],['681','Wallis and Futuna'],
  ['680','Palau'],['679','Fiji'],['678','Vanuatu'],['677','Solomon Islands'],['676','Tonga'],
  ['675','Papua New Guinea'],['674','Nauru'],['673','Brunei'],['672','Australian External Territories'],
  ['670','Timor-Leste'],['599','Caribbean Netherlands'],['598','Uruguay'],['597','Suriname'],
  ['596','Martinique'],['595','Paraguay'],['594','French Guiana'],['593','Ecuador'],
  ['592','Guyana'],['591','Bolivia'],['590','Guadeloupe / Saint Martin'],['509','Haiti'],
  ['508','Saint Pierre and Miquelon'],['507','Panama'],['506','Costa Rica'],['505','Nicaragua'],
  ['504','Honduras'],['503','El Salvador'],['502','Guatemala'],['501','Belize'],
  ['500','Falkland Islands'],['423','Liechtenstein'],['421','Slovakia'],['420','Czech Republic'],
  ['389','North Macedonia'],['387','Bosnia and Herzegovina'],['386','Slovenia'],['385','Croatia'],
  ['383','Kosovo'],['382','Montenegro'],['381','Serbia'],['380','Ukraine'],['378','San Marino'],
  ['377','Monaco'],['376','Andorra'],['375','Belarus'],['374','Armenia'],['373','Moldova'],
  ['372','Estonia'],['371','Latvia'],['370','Lithuania'],['359','Bulgaria'],['358','Finland'],
  ['357','Cyprus'],['356','Malta'],['355','Albania'],['354','Iceland'],['353','Ireland'],
  ['352','Luxembourg'],['351','Portugal'],['350','Gibraltar'],['299','Greenland'],['298','Faroe Islands'],
  ['297','Aruba'],['291','Eritrea'],['290','Saint Helena'],['269','Comoros'],['268','Eswatini'],
  ['267','Botswana'],['266','Lesotho'],['265','Malawi'],['264','Namibia'],['263','Zimbabwe'],
  ['262','Reunion / Mayotte'],['261','Madagascar'],['260','Zambia'],['258','Mozambique'],
  ['257','Burundi'],['256','Uganda'],['255','Tanzania'],['254','Kenya'],['253','Djibouti'],
  ['252','Somalia'],['251','Ethiopia'],['250','Rwanda'],['249','Sudan'],['248','Seychelles'],
  ['245','Guinea-Bissau'],['244','Angola'],['243','DR Congo'],['242','Republic of the Congo'],
  ['241','Gabon'],['240','Equatorial Guinea'],['239','Sao Tome and Principe'],['238','Cabo Verde'],
  ['237','Cameroon'],['236','Central African Republic'],['235','Chad'],['234','Nigeria'],
  ['233','Ghana'],['232','Sierra Leone'],['231','Liberia'],['230','Mauritius'],['229','Benin'],
  ['228','Togo'],['227','Niger'],['226','Burkina Faso'],['225',"Cote d'Ivoire"],['224','Guinea'],
  ['223','Mali'],['222','Mauritania'],['221','Senegal'],['220','Gambia'],['218','Libya'],
  ['216','Tunisia'],['213','Algeria'],['212','Morocco'],['98','Iran'],['95','Myanmar'],
  ['94','Sri Lanka'],['93','Afghanistan'],['92','Pakistan'],['91','India'],['90','Turkey'],
  ['86','China'],['84','Vietnam'],['82','South Korea'],['81','Japan'],['66','Thailand'],
  ['65','Singapore'],['64','New Zealand'],['63','Philippines'],['62','Indonesia'],['61','Australia'],
  ['60','Malaysia'],['58','Venezuela'],['57','Colombia'],['56','Chile'],['55','Brazil'],
  ['54','Argentina'],['53','Cuba'],['52','Mexico'],['51','Peru'],['49','Germany'],
  ['48','Poland'],['47','Norway'],['46','Sweden'],['45','Denmark'],['44','United Kingdom'],
  ['43','Austria'],['41','Switzerland'],['40','Romania'],['39','Italy'],['36','Hungary'],
  ['34','Spain'],['33','France'],['32','Belgium'],['31','Netherlands'],['30','Greece'],
  ['27','South Africa'],['20','Egypt'],['7','Russia / Kazakhstan']
];

export const detectCountryFromPhone = (phone: any) => {
  const raw = String(phone ?? '').trim();
  if (!raw) return '';

  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  // Accept +44..., 0044..., and international numbers stored as plain digits.
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    // A local/national number without a country prefix is ambiguous.
    return '';
  }

  if (digits.startsWith('1') && digits.length >= 11) {
    const areaCode = digits.slice(1, 4);
    if (CANADA_NANP_AREA_CODES.has(areaCode)) return 'Canada';
    if (NANP_TERRITORIES[areaCode]) return NANP_TERRITORIES[areaCode];
    return 'United States';
  }

  const match = COUNTRY_CALLING_CODES.find(([code]) => digits.startsWith(code));
  return match?.[1] || '';
};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

export const normalizeHeader = (value: any) =>
  String(value ?? '')
    .replace(/^﻿/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\-./\\:#*()[\]{}|"'`´’,;!?№]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cleanCell = (value: any) =>
  String(value ?? '')
    .replace(/^﻿/, '')
    .replace(/ /g, ' ')
    .replace(/[​-‏‪-‮]/g, '')
    .trim();

// ---------------------------------------------------------------------------
// Header dictionaries (normalized with normalizeHeader). Many languages.
// ---------------------------------------------------------------------------

const RAW_SYNONYMS: Record<Exclude<ImportRole, 'ignore' | 'phone2'>, string[]> = {
  name: [
    'name', 'full name', 'fullname', 'full_name', 'name surname', 'name and surname', 'first and last name',
    'first last', 'first last name', 'client', 'client name', 'customer', 'customer name', 'lead', 'lead name',
    'contact', 'contact name', 'person', 'person name', 'account name', 'display name', 'investor', 'investor name',
    'trader', 'trader name', 'depositor', 'user name', 'username', 'member', 'member name', 'applicant', 'prospect',
    'nombre', 'nombre completo', 'nombre y apellido', 'nombre y apellidos', 'cliente', 'nombre cliente', 'nombre del cliente',
    'nom', 'nom complet', 'nom et prenom', 'nom prenom', 'client nom',
    'vollstandiger name', 'voller name', 'kunde', 'kundenname', 'name vorname', 'vor und nachname',
    'nome', 'nome completo', 'nome e cognome', 'nominativo', 'cliente nome',
    'naam', 'volledige naam', 'klant', 'klantnaam',
    'imie i nazwisko', 'imie nazwisko', 'klient', 'nazwa klienta',
    'ad soyad', 'adsoyad', 'ad soyadi', 'isim', 'isim soyisim', 'musteri', 'musteri adi',
    'имя', 'фио', 'ф и о', 'полное имя', 'клиент', 'имя клиента', 'имя фамилия', 'фамилия имя', 'фамилия имя отчество', 'контакт',
    "ім'я", 'імя', 'піб', 'прізвище ім я', 'кліент', 'клієнт',
    'სახელი', 'სახელი გვარი', 'სახელი და გვარი', 'სრული სახელი', 'კლიენტი', 'კლიენტის სახელი', 'სახელი გვარით',
    'الاسم', 'الاسم الكامل', 'اسم', 'اسم العميل', 'العميل',
    'שם', 'שם מלא', 'שם הלקוח', 'לקוח',
    'jmeno', 'cele jmeno', 'jmeno a prijmeni', 'zakaznik',
    'namn', 'fullt namn', 'kund', 'navn', 'fulde navn', 'fullt navn', 'nimi', 'koko nimi', 'asiakas',
    'nev', 'teljes nev', 'ugyfel', 'nume', 'nume complet', 'nume si prenume', 'client nume',
    'ονομα', 'ονοματεπωνυμο', 'πελατης', 'име', 'пълно име', 'ime', 'ime i prezime', 'ime in priimek',
    'emri', 'emri i plote', 'vardas', 'vards', 'nimi ja perekonnanimi',
    '姓名', '名字', '客户', '名前', '氏名', '이름', '성명', 'ten', 'ho ten', 'ho va ten', 'khach hang',
    'nama', 'nama lengkap', 'pelanggan', 'ชื่อ', 'ชื่อ นามสกุล', 'नाम', 'पूरा नाम', 'نام', 'نام و نام خانوادگی'
  ],
  first_name: [
    'first name', 'firstname', 'first', 'fname', 'f name', 'given name', 'givenname', 'forename', 'christian name',
    'name first', 'first nm', 'primer nombre', 'nombre de pila', 'prenom', 'prenoms', 'vorname', 'rufname',
    'nome proprio', 'primeiro nome', 'voornaam', 'imie', 'ad', 'adi', 'isim adi', 'krestnoe imya',
    'имя клиента первое', 'imya', 'krsni ime', 'jmeno krestni', 'fornavn', 'fornamn', 'etunimi', 'keresztnev',
    'prenume', 'μικρο ονομα', 'ονομα πελατη', 'собствено име', 'pirmas vardas', 'eesnimi', 'ime osobe',
    'שם פרטי', 'الاسم الاول', 'الاسم الأول', 'სახელი პირველი', 'ten rieng', 'nama depan', 'नाम पहला', '名'
  ],
  middle_name: [
    'middle name', 'middlename', 'middle', 'mname', 'second name', 'segundo nombre', 'deuxieme prenom',
    'zweiter vorname', 'secondo nome', 'tweede naam', 'drugie imie', 'отчество', 'по батькові', 'по батькови',
    'მამის სახელი', 'patronymic'
  ],
  last_name: [
    'last name', 'lastname', 'last', 'lname', 'l name', 'surname', 'sur name', 'family name', 'familyname',
    'name last', 'last nm', 'nachname', 'familienname', 'zuname', 'nom de famille', 'apellido', 'apellidos',
    'primer apellido', 'cognome', 'sobrenome', 'apelido', 'achternaam', 'familienaam', 'nazwisko', 'soyad', 'soyadi',
    'soyisim', 'фамилия', 'прізвище', 'გვარი', 'اسم العائلة', 'اللقب', 'שם משפחה', 'prijmeni', 'efternamn',
    'etternavn', 'efternavn', 'sukunimi', 'vezeteknev', 'nume de familie', 'επωνυμο', 'фамилно име', 'prezime',
    'priimek', 'mbiemri', 'pavarde', 'uzvards', 'perekonnanimi', '姓', '姓氏', '苗字', '성', 'ho', 'nama belakang',
    'นามสกุล', 'उपनाम', 'نام خانوادگی'
  ],
  email: [
    'email', 'e mail', 'mail', 'emails', 'email address', 'emailaddress', 'e mail address', 'mail address',
    'email id', 'emailid', 'mail id', 'user email', 'contact email', 'primary email', 'customer email', 'client email',
    'lead email', 'work email', 'personal email', 'correo', 'correo electronico', 'email correo', 'direccion de correo',
    'courriel', 'adresse email', 'adresse e mail', 'adresse mail', 'mel', 'email adresse', 'e mail adresse',
    'posta elettronica', 'indirizzo email', 'posta', 'emailadres', 'e mailadres', 'adres email', 'adres e mail',
    'e posta', 'eposta', 'e posta adresi', 'почта', 'эл почта', 'электронная почта', 'имейл', 'емейл', 'мейл',
    'email адрес', 'e mail адрес', 'електронна пошта', 'пошта', 'ელფოსტა', 'ელ ფოსტა', 'მეილი', 'იმეილი',
    'ელექტრონული ფოსტა', 'ფოსტა', 'البريد الالكتروني', 'البريد الإلكتروني', 'البريد', 'ايميل', 'דואל', 'דוא ל',
    'אימייל', 'מייל', 'epost', 'e post', 'e postadress', 'sahkoposti', 'emailcim', 'e mail cim', 'adresa de email',
    'ηλεκτρονικο ταχυδρομειο', 'ειμειλ', 'имейл адрес', 'eposta', 'el pastas', 'e pasts', 'meiliaadress',
    '邮箱', '电子邮件', '邮件', 'メール', 'メールアドレス', '이메일', 'thu dien tu', 'surel', 'อีเมล', 'ईमेल', 'ایمیل'
  ],
  phone: [
    'phone', 'phone number', 'phonenumber', 'phones', 'phone no', 'phone nr', 'phone num', 'telephone', 'telephone number',
    'tel', 'tel no', 'tel nr', 'tel number', 'telno', 'telefon', 'telefonnummer', 'telefon nummer', 'rufnummer', 'handy nr', 'telefono',
    'numero de telefono', 'num telefono', 'telefone', 'numero de telefone', 'telefoon', 'telefoonnummer',
    'numero', 'numero de telephone', 'num tel', 'no tel', 'numero tel', 'mobile', 'mobile number', 'mobile phone',
    'mobile no', 'mob', 'mob no', 'mobil', 'mobilnummer', 'mobiltelefon', 'handy', 'handynummer', 'cell', 'cellphone',
    'cell phone', 'cell number', 'cellular', 'celular', 'movil', 'telefono movil', 'cellulare', 'numero cellulare',
    'portable', 'telephone portable', 'gsm', 'gsm no', 'whatsapp', 'whats app', 'whatsapp number', 'wa', 'wa number',
    'contact number', 'contact no', 'contact phone', 'phone contact', 'ph', 'ph no', 'msisdn', 'number', 'nummer', 'numer',
    'numer telefonu', 'nr telefonu', 'komorka', 'telefon numarasi', 'telefon no', 'cep', 'cep telefonu', 'gsm numarasi',
    'телефон', 'тел', 'номер', 'номер телефона', 'мобильный', 'мобильный телефон', 'моб', 'моб тел', 'сотовый',
    'контактный телефон', 'телефон клиента', 'мобільний', 'номер телефону', 'ტელეფონი', 'ტელ', 'ნომერი',
    'მობილური', 'ტელეფონის ნომერი', 'მობ', 'საკონტაქტო ნომერი', 'هاتف', 'الهاتف', 'رقم الهاتف', 'رقم', 'جوال',
    'رقم الجوال', 'موبايل', 'رقم الموبايل', 'טלפון', 'נייד', 'מספר טלפון', 'פלאפון', 'puhelin', 'puhelinnumero',
    'matkapuhelin', 'telefonszam', 'mobilszam', 'numar de telefon', 'numar telefon', 'τηλεφωνο', 'κινητο',
    'αριθμος τηλεφωνου', 'телефонен номер', 'broj telefona', 'mobitel', 'telefonas', 'talrunis', 'telefoninumber',
    '电话', '手机', '手机号', '电话号码', '聯絡電話', '電話', '電話番号', '携帯', '携帯番号', '전화', '전화번호', '휴대폰',
    'so dien thoai', 'sdt', 'dien thoai', 'nomor telepon', 'telepon', 'no hp', 'hp', 'โทรศัพท์', 'เบอร์โทร', 'फ़ोन',
    'फोन', 'मोबाइल', 'تلفن', 'شماره تلفن', 'موبایل', 'primary phone', 'main phone', 'phone primary', 'lead phone',
    'customer phone', 'client phone', 'full phone', 'full number', 'international phone', 'e164', 'phone e164'
  ],
  dial_code: [
    'dial code', 'dialcode', 'calling code', 'phone code', 'phonecode', 'phone prefix', 'prefix', 'country dial code',
    'country calling code', 'country phone code', 'isd', 'isd code', 'intl code', 'international code', 'cc', 'ccode',
    'country prefix', 'код страны', 'телефонный код', 'код', 'prefijo', 'indicativo', 'vorwahl', 'indicatif',
    'prefisso', 'kierunkowy', 'ulke kodu', 'ქვეყნის კოდი', 'კოდი', 'رمز الدولة', 'קידומת'
  ],
  country: [
    'country', 'country name', 'countries', 'nation', 'nationality', 'citizenship', 'country of residence',
    'residence country', 'residence', 'geo', 'geo country', 'country geo', 'lead country', 'customer country',
    'country code', 'country iso', 'iso', 'iso code', 'land', 'herkunftsland', 'wohnland', 'pays', 'pays de residence',
    'pais', 'pais de residencia', 'paese', 'nazione', 'stato di residenza', 'kraj', 'ulke', 'страна',
    'страна проживания', 'країна', 'ქვეყანა', 'სახელმწიფო', 'الدولة', 'البلد', 'دولة', 'מדינה', 'ארץ', 'zeme', 'stat',
    'maa', 'orszag', 'tara', 'χωρα', 'държава', 'drzava', 'valstybe', 'valsts', 'riik', '国家', '国', '国家地区',
    '국가', '나라', 'quoc gia', 'negara', 'ประเทศ', 'देश', 'کشور'
  ],
  source: [
    'source', 'lead source', 'leadsource', 'source name', 'src', 'origin', 'lead origin', 'channel', 'lead channel',
    'utm source', 'utmsource', 'traffic source', 'data source', 'source of lead', 'list', 'list name', 'database',
    'db', 'affiliate', 'affiliate name', 'aff', 'partner', 'supplier', 'vendor', 'provider', 'publisher', 'network',
    'fuente', 'origen', 'proveedor', 'quelle', 'herkunft', 'lieferant', 'provenance', 'fournisseur', 'fonte',
    'origine', 'fornitore', 'bron', 'herkomst', 'zrodlo', 'dostawca', 'kaynak', 'tedarikci', 'источник',
    'поставщик', 'джерело', 'წყარო', 'მომწოდებელი', 'المصدر', 'مصدر', 'מקור', 'zdroj', 'kalla', 'kilde', 'lahde',
    'forras', 'sursa', 'πηγη', 'източник', 'izvor', 'saltinis', 'avots', 'allikas', '来源', 'ソース', '출처', 'nguon',
    'sumber', 'แหล่งที่มา', 'स्रोत', 'منبع'
  ],
  status: [
    'status', 'lead status', 'leadstatus', 'stage', 'lead stage', 'disposition', 'call status', 'call result',
    'result', 'outcome', 'sales status', 'crm status', 'estado', 'estatus', 'statut', 'stato', 'stan', 'durum',
    'статус', 'состояние', 'სტატუსი', 'მდგომარეობა', 'الحالة', 'حالة', 'סטטוס', 'stav', 'tila', 'allapot', 'stare',
    'κατασταση', 'статус на', 'busena', 'statuss', 'olek', '状态', 'ステータス', '상태', 'trang thai', 'สถานะ', 'स्थिति', 'وضعیت'
  ],
  assigned_to: [
    'assigned to', 'assigned', 'assigned agent', 'assignee', 'agent', 'agent name', 'agent email', 'owner', 'lead owner',
    'record owner', 'rep', 'sales rep', 'salesperson', 'sales agent', 'retention', 'retention agent', 'conversion agent',
    'account manager', 'responsible', 'responsible agent', 'crm agent', 'asignado', 'agente',
    'responsable', 'zugewiesen', 'zustandig', 'betreuer', 'assegnato', 'agente assegnato', 'toegewezen', 'przypisany',
    'opiekun', 'atanan', 'temsilci', 'ответственный', 'менеджер', 'агент', 'відповідальний', 'აგენტი', 'მენეჯერი',
    'პასუხისმგებელი', 'الموظف', 'المسؤول', 'נציג', 'אחראי'
  ],
  notes: [
    'notes', 'note', 'comment', 'comments', 'remark', 'remarks', 'description', 'details', 'info', 'information',
    'message', 'memo', 'last comment', 'last note', 'feedback', 'history', 'call notes', 'agent notes', 'observations',
    'observaciones', 'comentario', 'comentarios', 'notas', 'nota', 'bemerkung', 'bemerkungen', 'kommentar', 'notiz',
    'notizen', 'commentaire', 'commentaires', 'remarque', 'remarques', 'commento', 'commenti', 'opmerking',
    'opmerkingen', 'uwagi', 'komentarz', 'notatka', 'notlar', 'not', 'aciklama', 'yorum', 'комментарий',
    'комментарии', 'примечание', 'примечания', 'заметки', 'заметка', 'коммент', 'коментар', 'примітка',
    'შენიშვნა', 'შენიშვნები', 'კომენტარი', 'კომენტარები', 'ჩანაწერი', 'ჩანაწერები', 'ملاحظات', 'ملاحظة', 'تعليق',
    'הערות', 'הערה', 'poznamka', 'kommentti', 'megjegyzes', 'observatii', 'σχολια', 'σημειωσεις', 'бележки',
    'napomena', 'pastabos', 'piezimes', 'markused', '备注', '评论', '備考', 'メモ', '메모', '비고', 'ghi chu',
    'catatan', 'หมายเหตุ', 'टिप्पणी', 'توضیحات'
  ],
  extra: [
    'city', 'town', 'ciudad', 'ville', 'stadt', 'ort', 'citta', 'cidade', 'stad', 'miasto', 'sehir', 'il', 'город',
    'місто', 'ქალაქი', 'المدينة', 'עיר', 'address', 'street', 'address line', 'address 1', 'full address', 'adresse',
    'direccion', 'indirizzo', 'endereco', 'adres', 'адрес', 'адреса', 'მისამართი', 'العنوان', 'כתובת', 'zip',
    'zip code', 'zipcode', 'postal code', 'postcode', 'post code', 'plz', 'postleitzahl', 'code postal', 'cap',
    'codigo postal', 'индекс', 'state', 'province', 'region', 'county', 'area', 'estado provincia', 'provincia',
    'bundesland', 'область', 'регион', 'რეგიონი', 'company', 'company name', 'organization', 'organisation',
    'business', 'empresa', 'firma', 'societe', 'entreprise', 'azienda', 'bedrijf', 'sirket', 'компания',
    'კომპანია', 'job title', 'title', 'position', 'occupation', 'profession', 'job', 'должность', 'პოზიცია',
    'age', 'edad', 'alter', 'возраст', 'ასაკი', 'gender', 'sex', 'пол', 'სქესი', 'birthday', 'date of birth',
    'birth date', 'dob', 'birthdate', 'дата рождения', 'დაბადების თარიღი', 'language', 'lang', 'idioma', 'sprache',
    'langue', 'язык', 'ენა', 'currency', 'deposit', 'deposit amount', 'ftd', 'ftd amount', 'balance', 'amount',
    'budget', 'invest', 'investment', 'investment amount', 'income', 'campaign', 'campaign name', 'utm campaign',
    'utm medium', 'utm content', 'utm term', 'medium', 'adset', 'ad set', 'ad name', 'keyword', 'funnel', 'landing',
    'landing page', 'url', 'website', 'web', 'site', 'offer', 'brand', 'registration date', 'reg date',
    'registration', 'signup date', 'sign up date', 'created', 'created at', 'created date', 'creation date',
    'date created', 'date', 'lead date', 'fecha', 'datum', 'дата', 'თარიღი', 'ip', 'ip address', 'timezone',
    'time zone', 'skype', 'telegram', 'telegram username', 'aff id', 'affiliate id', 'sub id', 'subid', 'click id',
    'external id', 'experience', 'trading experience', 'platform', 'account type', 'desk', 'team', 'callback',
    'callback date', 'last contact', 'last call', 'last activity'
  ]
};

const IGNORE_HEADERS = new Set(
  ['id', 'lead id', 'leadid', 'uuid', 'guid', '#', 'no', 'n', 'nr', 'row', 'row no', 's n', 'sn', 'sl no', 'sr no',
   'serial', 'serial no', 'index', 'fax', 'fax number', 'password', 'pass', 'pwd', 'checkbox', 'select']
    .map(normalizeHeader)
);

const SYNONYMS: Record<string, Set<string>> = {};
Object.entries(RAW_SYNONYMS).forEach(([role, list]) => {
  SYNONYMS[role] = new Set(list.map(normalizeHeader).filter(Boolean));
});

// Words that make a "phone"/"email" header a secondary one (Phone 2, Home Phone…)
const SECONDARY_WORDS = new Set(
  ['2', '3', '4', '5', 'second', 'secondary', 'alt', 'alternate', 'alternative', 'other', 'another', 'additional',
   'extra', 'home', 'work', 'office', 'landline', 'business', 'backup', 'fixed', 'festnetz', 'privat', 'domicile',
   'casa', 'fijo', 'altro', 'drugi', 'домашний', 'рабочий', 'дополнительный', 'второй', 'სახლის',
   'სამსახურის', 'დამატებითი', 'მეორე'].map(normalizeHeader)
);
const isSecondaryHeader = (h: string) => h.split(' ').some(t => SECONDARY_WORDS.has(t)) || /[a-z\u0400-\u04ff\u10a0-\u10ff][2-9]$/.test(h);

// Generic "name" headers that can mean a first or last name depending on the
// other columns (Nombre + Apellido, Имя + Фамилия, Prénom + Nom …).
const AMBIGUOUS_NAME_HEADERS = new Set(
  ['name', 'nombre', 'nom', 'nome', 'naam', 'imie', 'имя', 'სახელი', 'isim', 'jmeno', 'namn', 'navn', 'nimi', 'nev',
   'nume', 'ονομα', 'име', 'ime', 'emri', 'vardas', 'vards', 'ten', 'nama', 'שם', 'اسم', 'الاسم', "ім'я", 'імя']
    .map(normalizeHeader)
);

const headerMatch = (header: string): { role: ImportRole; score: number } => {
  const h = normalizeHeader(header);
  if (!h) return { role: 'ignore', score: 0 };
  if (IGNORE_HEADERS.has(h)) return { role: 'ignore', score: 90 };

  const secondary = isSecondaryHeader(h);
  // "Phone 1", "Email1", "Mobile #1" → treat like the base word.
  const base = h.replace(/\s*\b(1|01|one|primary|main|principal)\b\s*/g, ' ').replace(/\s*\d+$/, '').replace(/\s+/g, ' ').trim();

  const order: Array<Exclude<ImportRole, 'ignore' | 'phone2'>> = [
    'email', 'dial_code', 'phone', 'first_name', 'middle_name', 'last_name', 'name', 'country', 'source', 'status',
    'assigned_to', 'notes', 'extra'
  ];

  const finish = (role: ImportRole, score: number) => {
    if (secondary && role === 'phone') return { role: 'phone2' as ImportRole, score };
    if (secondary && role === 'email') return { role: 'extra' as ImportRole, score };
    return { role, score };
  };

  for (const role of order) {
    if (SYNONYMS[role].has(h) || SYNONYMS[role].has(base)) return finish(role, 100);
  }

  // Partial match: header contains a known word ("Customer Phone Number (mobile)").
  let best: { role: ImportRole; score: number } = { role: 'ignore', score: 0 };
  for (const role of order) {
    for (const syn of SYNONYMS[role]) {
      if (syn.length < 4 && !/[^\x00-\x7F]/.test(syn)) continue;
      const padded = ` ${h} `;
      if (padded.includes(` ${syn} `) || (syn.length >= 5 && h.includes(syn))) {
        const score = 55 + Math.min(30, syn.length * 2);
        if (score > best.score) best = { role, score };
      }
    }
  }
  return best.score ? finish(best.role, best.score) : best;
};

// ---------------------------------------------------------------------------
// Countries (names in several languages + ISO codes) and dial codes
// ---------------------------------------------------------------------------

const ISO2: Record<string, string> = {
  US: 'United States', CA: 'Canada', GB: 'United Kingdom', UK: 'United Kingdom', IE: 'Ireland', DE: 'Germany',
  AT: 'Austria', CH: 'Switzerland', FR: 'France', BE: 'Belgium', NL: 'Netherlands', LU: 'Luxembourg', IT: 'Italy',
  ES: 'Spain', PT: 'Portugal', GR: 'Greece', CY: 'Cyprus', MT: 'Malta', DK: 'Denmark', SE: 'Sweden', NO: 'Norway',
  FI: 'Finland', IS: 'Iceland', PL: 'Poland', CZ: 'Czech Republic', SK: 'Slovakia', HU: 'Hungary', RO: 'Romania',
  BG: 'Bulgaria', HR: 'Croatia', SI: 'Slovenia', RS: 'Serbia', BA: 'Bosnia and Herzegovina', ME: 'Montenegro',
  MK: 'North Macedonia', AL: 'Albania', XK: 'Kosovo', EE: 'Estonia', LV: 'Latvia', LT: 'Lithuania', UA: 'Ukraine',
  BY: 'Belarus', MD: 'Moldova', RU: 'Russia', GE: 'Georgia', AM: 'Armenia', AZ: 'Azerbaijan', KZ: 'Kazakhstan',
  UZ: 'Uzbekistan', KG: 'Kyrgyzstan', TJ: 'Tajikistan', TM: 'Turkmenistan', TR: 'Turkey', IL: 'Israel',
  AE: 'United Arab Emirates', SA: 'Saudi Arabia', QA: 'Qatar', KW: 'Kuwait', BH: 'Bahrain', OM: 'Oman', JO: 'Jordan',
  LB: 'Lebanon', EG: 'Egypt', MA: 'Morocco', DZ: 'Algeria', TN: 'Tunisia', ZA: 'South Africa', NG: 'Nigeria',
  KE: 'Kenya', GH: 'Ghana', IN: 'India', PK: 'Pakistan', BD: 'Bangladesh', LK: 'Sri Lanka', CN: 'China',
  HK: 'Hong Kong', TW: 'Taiwan', JP: 'Japan', KR: 'South Korea', SG: 'Singapore', MY: 'Malaysia', TH: 'Thailand',
  VN: 'Vietnam', PH: 'Philippines', ID: 'Indonesia', AU: 'Australia', NZ: 'New Zealand', MX: 'Mexico', BR: 'Brazil',
  AR: 'Argentina', CL: 'Chile', CO: 'Colombia', PE: 'Peru', VE: 'Venezuela', EC: 'Ecuador', UY: 'Uruguay',
  PY: 'Paraguay', BO: 'Bolivia', CR: 'Costa Rica', PA: 'Panama', DO: 'Dominican Republic', PR: 'Puerto Rico',
  JM: 'Jamaica', LI: 'Liechtenstein', MC: 'Monaco', AD: 'Andorra', SM: 'San Marino'
};

const ISO3: Record<string, string> = {
  USA: 'United States', CAN: 'Canada', GBR: 'United Kingdom', IRL: 'Ireland', DEU: 'Germany', GER: 'Germany',
  AUT: 'Austria', CHE: 'Switzerland', FRA: 'France', BEL: 'Belgium', NLD: 'Netherlands', ITA: 'Italy', ESP: 'Spain',
  PRT: 'Portugal', GRC: 'Greece', CYP: 'Cyprus', DNK: 'Denmark', SWE: 'Sweden', NOR: 'Norway', FIN: 'Finland',
  POL: 'Poland', CZE: 'Czech Republic', SVK: 'Slovakia', HUN: 'Hungary', ROU: 'Romania', BGR: 'Bulgaria',
  HRV: 'Croatia', SVN: 'Slovenia', SRB: 'Serbia', EST: 'Estonia', LVA: 'Latvia', LTU: 'Lithuania', UKR: 'Ukraine',
  RUS: 'Russia', GEO: 'Georgia', ARM: 'Armenia', AZE: 'Azerbaijan', KAZ: 'Kazakhstan', TUR: 'Turkey', ISR: 'Israel',
  ARE: 'United Arab Emirates', UAE: 'United Arab Emirates', SAU: 'Saudi Arabia', ZAF: 'South Africa', IND: 'India',
  CHN: 'China', JPN: 'Japan', KOR: 'South Korea', SGP: 'Singapore', MYS: 'Malaysia', THA: 'Thailand', AUS: 'Australia',
  NZL: 'New Zealand', MEX: 'Mexico', BRA: 'Brazil', ARG: 'Argentina', CHL: 'Chile', COL: 'Colombia', PER: 'Peru',
  LUX: 'Luxembourg', MLT: 'Malta', ISL: 'Iceland'
};

// Local-language country names → English name.
const COUNTRY_ALIASES: Record<string, string> = {
  'usa': 'United States', 'u s a': 'United States', 'us': 'United States', 'u s': 'United States',
  'united states of america': 'United States', 'america': 'United States', 'estados unidos': 'United States',
  'etats unis': 'United States', 'vereinigte staaten': 'United States', 'сша': 'United States', 'აშშ': 'United States',
  'uk': 'United Kingdom', 'u k': 'United Kingdom', 'great britain': 'United Kingdom', 'britain': 'United Kingdom',
  'england': 'United Kingdom', 'scotland': 'United Kingdom', 'wales': 'United Kingdom', 'northern ireland': 'United Kingdom',
  'reino unido': 'United Kingdom', 'royaume uni': 'United Kingdom', 'grossbritannien': 'United Kingdom',
  'vereinigtes konigreich': 'United Kingdom', 'regno unito': 'United Kingdom', 'великобритания': 'United Kingdom',
  'англия': 'United Kingdom', 'დიდი ბრიტანეთი': 'United Kingdom', 'ინგლისი': 'United Kingdom',
  'deutschland': 'Germany', 'allemagne': 'Germany', 'alemania': 'Germany', 'germania': 'Germany', 'duitsland': 'Germany',
  'niemcy': 'Germany', 'almanya': 'Germany', 'германия': 'Germany', 'გერმანია': 'Germany',
  'osterreich': 'Austria', 'autriche': 'Austria', 'австрия': 'Austria', 'ავსტრია': 'Austria',
  'schweiz': 'Switzerland', 'suisse': 'Switzerland', 'svizzera': 'Switzerland', 'suiza': 'Switzerland',
  'швейцария': 'Switzerland', 'შვეიცარია': 'Switzerland',
  'francia': 'France', 'frankreich': 'France', 'франция': 'France', 'საფრანგეთი': 'France',
  'belgique': 'Belgium', 'belgie': 'Belgium', 'belgien': 'Belgium', 'бельгия': 'Belgium', 'ბელგია': 'Belgium',
  'nederland': 'Netherlands', 'holland': 'Netherlands', 'the netherlands': 'Netherlands', 'pays bas': 'Netherlands',
  'niederlande': 'Netherlands', 'paises bajos': 'Netherlands', 'нидерланды': 'Netherlands', 'ნიდერლანდები': 'Netherlands',
  'italia': 'Italy', 'italie': 'Italy', 'italien': 'Italy', 'италия': 'Italy', 'იტალია': 'Italy',
  'espana': 'Spain', 'espagne': 'Spain', 'spanien': 'Spain', 'spagna': 'Spain', 'испания': 'Spain', 'ესპანეთი': 'Spain',
  'portugal': 'Portugal', 'португалия': 'Portugal', 'პორტუგალია': 'Portugal',
  'ellada': 'Greece', 'hellas': 'Greece', 'griechenland': 'Greece', 'grece': 'Greece', 'grecia': 'Greece',
  'ελλαδα': 'Greece', 'греция': 'Greece', 'საბერძნეთი': 'Greece',
  'kypros': 'Cyprus', 'κυπρος': 'Cyprus', 'кипр': 'Cyprus', 'კვიპროსი': 'Cyprus',
  'danmark': 'Denmark', 'dänemark': 'Denmark', 'danemark': 'Denmark', 'дания': 'Denmark',
  'sverige': 'Sweden', 'schweden': 'Sweden', 'suede': 'Sweden', 'швеция': 'Sweden', 'შვედეთი': 'Sweden',
  'norge': 'Norway', 'norwegen': 'Norway', 'norvege': 'Norway', 'норвегия': 'Norway', 'ნორვეგია': 'Norway',
  'suomi': 'Finland', 'finnland': 'Finland', 'финляндия': 'Finland', 'ფინეთი': 'Finland',
  'polska': 'Poland', 'polen': 'Poland', 'pologne': 'Poland', 'polonia': 'Poland', 'польша': 'Poland', 'პოლონეთი': 'Poland',
  'czechia': 'Czech Republic', 'cesko': 'Czech Republic', 'ceska republika': 'Czech Republic', 'tschechien': 'Czech Republic',
  'чехия': 'Czech Republic', 'ჩეხეთი': 'Czech Republic',
  'slovensko': 'Slovakia', 'словакия': 'Slovakia', 'magyarorszag': 'Hungary', 'ungarn': 'Hungary', 'венгрия': 'Hungary',
  'romania': 'Romania', 'rumanien': 'Romania', 'румыния': 'Romania', 'რუმინეთი': 'Romania',
  'bulgaria': 'Bulgaria', 'българия': 'Bulgaria', 'болгария': 'Bulgaria', 'ბულგარეთი': 'Bulgaria',
  'hrvatska': 'Croatia', 'хорватия': 'Croatia', 'slovenija': 'Slovenia', 'srbija': 'Serbia', 'сербия': 'Serbia',
  'eesti': 'Estonia', 'latvija': 'Latvia', 'lietuva': 'Lithuania', 'эстония': 'Estonia', 'латвия': 'Latvia', 'литва': 'Lithuania',
  'ukraina': 'Ukraine', 'украина': 'Ukraine', 'україна': 'Ukraine', 'უკრაინა': 'Ukraine',
  'belarus': 'Belarus', 'беларусь': 'Belarus', 'moldova': 'Moldova', 'молдова': 'Moldova',
  'russia': 'Russia', 'russian federation': 'Russia', 'rossiya': 'Russia', 'россия': 'Russia', 'рф': 'Russia', 'რუსეთი': 'Russia',
  'georgia': 'Georgia', 'sakartvelo': 'Georgia', 'საქართველო': 'Georgia', 'грузия': 'Georgia',
  'armenia': 'Armenia', 'армения': 'Armenia', 'სომხეთი': 'Armenia', 'azerbaijan': 'Azerbaijan', 'азербайджан': 'Azerbaijan',
  'აზერბაიჯანი': 'Azerbaijan', 'kazakhstan': 'Kazakhstan', 'казахстан': 'Kazakhstan', 'ყაზახეთი': 'Kazakhstan',
  'turkiye': 'Turkey', 'turkei': 'Turkey', 'turquie': 'Turkey', 'turquia': 'Turkey', 'турция': 'Turkey', 'თურქეთი': 'Turkey',
  'israel': 'Israel', 'израиль': 'Israel', 'ისრაელი': 'Israel', 'ישראל': 'Israel',
  'uae': 'United Arab Emirates', 'u a e': 'United Arab Emirates', 'emirates': 'United Arab Emirates', 'dubai': 'United Arab Emirates',
  'оаэ': 'United Arab Emirates', 'არაბთა გაერთიანებული საამიროები': 'United Arab Emirates', 'ksa': 'Saudi Arabia',
  'canada': 'Canada', 'канада': 'Canada', 'კანადა': 'Canada', 'kanada': 'Canada',
  'australia': 'Australia', 'australien': 'Australia', 'австралия': 'Australia', 'ავსტრალია': 'Australia',
  'new zealand': 'New Zealand', 'neuseeland': 'New Zealand', 'mexico': 'Mexico', 'brasil': 'Brazil', 'brasilien': 'Brazil',
  'ireland': 'Ireland', 'eire': 'Ireland', 'irland': 'Ireland', 'irlande': 'Ireland', 'ирландия': 'Ireland',
  'luxemburg': 'Luxembourg', 'south africa': 'South Africa', 'suedafrika': 'South Africa', 'sudafrica': 'South Africa',
  'india': 'India', 'индия': 'India', 'china': 'China', 'китай': 'China', 'japan': 'Japan', 'япония': 'Japan',
  'south korea': 'South Korea', 'korea': 'South Korea', 'singapore': 'Singapore', 'malaysia': 'Malaysia'
};

const COUNTRY_CALLING_CODES_FOR_IMPORT = COUNTRY_CALLING_CODES;

const COUNTRY_NAME_SET = new Set<string>();
const COUNTRY_CANONICAL: Record<string, string> = {};
const addCountry = (key: string, name: string) => {
  const k = normalizeHeader(key);
  if (!k) return;
  COUNTRY_NAME_SET.add(k);
  COUNTRY_CANONICAL[k] = name;
};
COUNTRY_CALLING_CODES_FOR_IMPORT.forEach(([, name]) => {
  name.split('/').forEach(part => addCountry(part.trim(), part.trim()));
  addCountry(name, name);
});
Object.values(ISO2).forEach(name => addCountry(name, name));
Object.entries(COUNTRY_ALIASES).forEach(([alias, name]) => addCountry(alias, name));

const NAME_TO_DIAL: Record<string, string> = {};
COUNTRY_CALLING_CODES_FOR_IMPORT.forEach(([code, name]) => {
  name.split('/').forEach(part => {
    const k = normalizeHeader(part.trim());
    if (k && !NAME_TO_DIAL[k]) NAME_TO_DIAL[k] = code;
  });
});
NAME_TO_DIAL[normalizeHeader('United States')] = '1';
NAME_TO_DIAL[normalizeHeader('Canada')] = '1';
NAME_TO_DIAL[normalizeHeader('Russia')] = '7';
NAME_TO_DIAL[normalizeHeader('Kazakhstan')] = '7';
const DIAL_CODES = new Set(COUNTRY_CALLING_CODES_FOR_IMPORT.map(([code]) => code).concat(['1', '7']));

// Returns the English country name, or '' when the value is not a country.
export const canonicalCountry = (value: any): string => {
  const raw = cleanCell(value);
  if (!raw) return '';
  const upper = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (raw.length <= 5 && /^[A-Za-z.]{2,5}$/.test(raw)) {
    if (upper.length === 2 && ISO2[upper]) return ISO2[upper];
    if (upper.length === 3 && ISO3[upper]) return ISO3[upper];
  }
  const k = normalizeHeader(raw);
  if (COUNTRY_CANONICAL[k]) return COUNTRY_CANONICAL[k];
  // "Germany (DE)", "DE - Germany", "🇩🇪 Germany"
  const stripped = normalizeHeader(raw.replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\s]/gu, ' '));
  if (COUNTRY_CANONICAL[stripped]) return COUNTRY_CANONICAL[stripped];
  const parts = stripped.split(' ').filter(Boolean);
  for (let size = Math.min(4, parts.length); size >= 1; size--) {
    for (let i = 0; i + size <= parts.length; i++) {
      const piece = parts.slice(i, i + size).join(' ');
      if (piece.length >= 4 && COUNTRY_CANONICAL[piece]) return COUNTRY_CANONICAL[piece];
    }
  }
  return '';
};

export const dialCodeForCountry = (country: string) => NAME_TO_DIAL[normalizeHeader(country)] || '';

// ---------------------------------------------------------------------------
// Value parsers
// ---------------------------------------------------------------------------

const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

export const parseEmail = (value: any) => {
  const raw = cleanCell(value).replace(/^mailto:/i, '');
  const m = raw.match(EMAIL_RE);
  return m ? m[0].toLowerCase().replace(/\.+$/, '') : '';
};

const looksLikeDate = (s: string) =>
  /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2})?)?/.test(s) ||
  /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/.test(s) ||
  /^\d{1,2}:\d{2}(:\d{2})?$/.test(s);

// Expand Excel scientific notation (4.47700900123E+11) when nothing better exists.
const expandScientific = (s: string) => {
  const m = s.replace(',', '.').match(/^\+?(\d+)(?:\.(\d+))?e\+?(\d+)$/i);
  if (!m) return s;
  const intPart = m[1];
  const frac = m[2] || '';
  const exp = Number(m[3]);
  const digits = intPart + frac;
  const zeros = exp - frac.length;
  return zeros >= 0 ? digits + '0'.repeat(zeros) : digits.slice(0, digits.length + zeros);
};

// Splits "a / b", "a; b", "a, b", "a | b", line breaks — only when each part is a phone.
export const splitPhones = (value: any): string[] => {
  const raw = cleanCell(value);
  if (!raw) return [];
  const parts = raw.split(/\s*(?:[;|/\n\r]+|,(?=\s*[+(\d]{3})|\s{3,}|\bor\b|\bили\b|\bან\b)\s*/i).map(p => p.trim()).filter(Boolean);
  const phoneParts = parts.filter(p => p.replace(/\D/g, '').length >= 6);
  return phoneParts.length > 1 ? phoneParts : [raw];
};

export type PhoneOptions = { dialCode?: string; countryForPrefix?: string; addPrefixToLocal?: boolean };

// Cleans one phone value: keeps a leading "+", removes spaces/dashes/brackets/dots,
// "tel:", extensions, converts 00 → +, and fixes Excel's 4.47E+11.
export const parsePhone = (value: any, opts: PhoneOptions = {}): string => {
  let raw = cleanCell(value);
  if (!raw) return '';
  raw = raw.replace(/^(tel|phone|mobile|whatsapp|wa)\s*[:.]?\s*/i, '');
  raw = raw.replace(/\s*(ext|ext\.|x|доб|внутр)\s*\.?\s*\d{1,6}$/i, '');
  if (/e\+?\d+$/i.test(raw)) raw = expandScientific(raw);
  if (looksLikeDate(raw) && raw.replace(/\D/g, '').length < 10) return '';
  raw = raw.replace(/\.0+$/, ''); // 447700900123.0 from some exports

  const hasPlus = /^\s*\+/.test(raw) || /^\s*\(\s*\+/.test(raw);
  let digits = raw.replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 16) return digits.length >= 6 ? (hasPlus ? '+' : '') + digits : '';

  if (hasPlus) return `+${digits}`;
  if (digits.startsWith('00') && digits.length >= 10) return `+${digits.slice(2)}`;

  const dial = String(opts.dialCode || '').replace(/\D/g, '');
  if (dial) {
    if (digits.startsWith(dial) && digits.length >= dial.length + 7) return `+${digits}`;
    const local = digits.replace(/^0+/, '');
    if (local.length >= 6) return `+${dial}${local}`;
  }

  if (opts.addPrefixToLocal && opts.countryForPrefix) {
    const code = dialCodeForCountry(opts.countryForPrefix);
    if (code) {
      if (digits.startsWith(code) && digits.length >= code.length + 8) return `+${digits}`;
      // Italy / San Marino keep the leading 0 in international format.
      if ((code === '39' || code === '378') && digits.length >= 6) return `+${code}${digits}`;
      // Russia / Kazakhstan local format: 8 9XX XXX XX XX.
      if (code === '7' && digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
      if (digits.startsWith('0') && !digits.startsWith('00')) return `+${code}${digits.replace(/^0+/, '')}`;
      if (code === '1' && digits.length === 10) return `+1${digits}`;
    }
  }

  return digits;
};

export const parseDialCode = (value: any) => {
  const digits = cleanCell(value).replace(/\D/g, '');
  if (!digits || digits.length > 4) return '';
  return DIAL_CODES.has(digits) ? digits : '';
};

const titleCaseIfNeeded = (s: string) => {
  const letters = s.replace(/[^\p{L}]/gu, '');
  if (letters.length < 2) return s;
  // Only Latin / Cyrillic / Greek have real upper & lower case in names
  // (Georgian, Arabic, Hebrew, CJK … are left exactly as written).
  if (!/^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}]+$/u.test(letters)) return s;
  const allUpper = letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  const allLower = letters === letters.toLowerCase() && letters !== letters.toUpperCase();
  if (!allUpper && !allLower) return s;
  return s.toLowerCase().replace(/(^|[\s'\-.])(\p{L})/gu, (_m, p, c) => p + c.toUpperCase());
};

export const cleanName = (value: any) => {
  let s = cleanCell(value).replace(/\s+/g, ' ');
  if (!s) return '';
  if (parseEmail(s) && s.includes('@')) return '';
  // "Doe, John" → "John Doe"
  const comma = s.split(',');
  if (comma.length === 2 && comma[0].trim() && comma[1].trim() && !/\d/.test(s)) {
    s = `${comma[1].trim()} ${comma[0].trim()}`;
  }
  s = s.replace(/^(mr|mrs|ms|miss|dr|herr|frau|sr|sra|m|mme|г-н|г-жа)\.?\s+/i, '');
  return titleCaseIfNeeded(s).slice(0, 120);
};

export const nameFromEmail = (email: string) => {
  const local = String(email || '').split('@')[0] || '';
  const words = local.replace(/\d+/g, ' ').split(/[._\-+]+/).map(w => w.trim()).filter(w => w.length >= 2);
  if (!words.length) return '';
  return words.slice(0, 3).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

// ---------------------------------------------------------------------------
// Reading files
// ---------------------------------------------------------------------------

export type SheetGrid = { name: string; rows: string[][] };

const decodeText = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Old Excel CSV exports: Cyrillic (1251) or Western (1252).
    const cyr = new TextDecoder('windows-1251').decode(bytes);
    const cyrLetters = (cyr.match(/[Ѐ-ӿ]/g) || []).length;
    return cyrLetters > 20 ? cyr : new TextDecoder('windows-1252').decode(bytes);
  }
};

const detectDelimiter = (text: string) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 20);
  const candidates = [',', ';', '\t', '|'];
  let best = ',';
  let bestScore = -1;
  candidates.forEach(d => {
    const counts = lines.map(l => {
      let n = 0;
      let q = false;
      for (const ch of l) {
        if (ch === '"') q = !q;
        else if (ch === d && !q) n++;
      }
      return n;
    });
    const nonZero = counts.filter(c => c > 0);
    if (!nonZero.length) return;
    const avg = nonZero.reduce((a, b) => a + b, 0) / nonZero.length;
    const consistent = nonZero.filter(c => Math.abs(c - avg) <= 1).length / lines.length;
    const score = consistent * 10 + Math.min(avg, 30) / 10;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  });
  return best;
};

export const parseDelimited = (text: string): string[][] => {
  const src = text.replace(/^﻿/, '');
  // Excel "sep=;" hint line.
  let body = src;
  let delimiter = '';
  const sepLine = src.match(/^sep=(.)\r?\n/i);
  if (sepLine) {
    delimiter = sepLine[1];
    body = src.slice(sepLine[0].length);
  }
  if (!delimiter) delimiter = detectDelimiter(body);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inQuotes) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field.trim() === '') {
      inQuotes = true;
      field = '';
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  // Excel's ="00123" text-protection trick.
  return rows.map(r => r.map(c => cleanCell(c.replace(/^="(.*)"$/, '$1'))));
};

const TEXT_EXT = /\.(csv|tsv|txt|tab|psv)$/i;

export const SUPPORTED_EXTENSIONS = '.csv,.tsv,.txt,.xlsx,.xlsm,.xlsb,.xls,.ods,.numbers';

export const isSupportedFile = (file: File) =>
  /\.(csv|tsv|txt|tab|psv|xlsx|xlsm|xlsb|xls|ods|numbers)$/i.test(file.name) ||
  [
    'text/csv', 'text/plain', 'text/tab-separated-values', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.oasis.opendocument.spreadsheet'
  ].includes(file.type);

export async function readSpreadsheet(file: File): Promise<SheetGrid[]> {
  const buffer = await file.arrayBuffer();

  if (TEXT_EXT.test(file.name) || file.type === 'text/csv' || file.type === 'text/plain') {
    const text = decodeText(buffer);
    // Some ".xls" downloads are actually HTML/CSV and vice versa — check content.
    if (!/^\s*<(html|table|\?xml)/i.test(text)) {
      return [{ name: file.name.replace(/\.[^.]+$/, '') || 'Sheet 1', rows: parseDelimited(text) }];
    }
  }

  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false });
  return workbook.SheetNames.map(sheetName => {
    const ws = workbook.Sheets[sheetName];
    if (!ws || !ws['!ref']) return { name: sheetName, rows: [] };
    const range = XLSX.utils.decode_range(ws['!ref']);
    const rows: string[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (!cell) {
          row.push('');
          continue;
        }
        let text = cell.w !== undefined ? String(cell.w) : String(cell.v ?? '');
        // A number shown as 4.47E+11 or with lost digits: use the real value.
        if (cell.t === 'n' && typeof cell.v === 'number' && Number.isFinite(cell.v)) {
          const exact = Math.abs(cell.v) >= 1e6 && Number.isInteger(cell.v) ? cell.v.toFixed(0) : '';
          if (exact && (/e\+?\d/i.test(text) || text.replace(/\D/g, '').length < exact.length)) text = exact;
        }
        row.push(cleanCell(text));
      }
      rows.push(row);
    }
    return { name: sheetName, rows };
  });
}

// ---------------------------------------------------------------------------
// Header-row and column detection
// ---------------------------------------------------------------------------

const isBlankRow = (row: string[]) => !row || row.every(c => !cleanCell(c));

const rowHeaderScore = (row: string[]) => {
  let hits = 0;
  let strong = 0;
  let filled = 0;
  let dataLike = 0;
  row.forEach(cell => {
    const v = cleanCell(cell);
    if (!v) return;
    filled++;
    const m = headerMatch(v);
    if (m.score >= 55 && m.role !== 'ignore') hits++;
    else if (parseEmail(v) || v.replace(/\D/g, '').length >= 7) dataLike++;
    if (m.score >= 100 && ['name', 'first_name', 'last_name', 'email', 'phone', 'country'].includes(m.role)) strong++;
  });
  return { hits, strong, filled, dataLike };
};

// Picks the row that looks most like a header within the first 30 rows.
// Returns -1 when the file has no header row at all.
export const detectHeaderRow = (rows: string[][]) => {
  let bestIndex = -1;
  let bestScore = 0;
  const limit = Math.min(rows.length, 30);
  for (let i = 0; i < limit; i++) {
    if (isBlankRow(rows[i])) continue;
    const s = rowHeaderScore(rows[i]);
    if (!s.filled || s.dataLike > 0 && s.dataLike >= s.hits) continue;
    const score = s.strong * 3 + s.hits * 2 + (s.filled >= 2 ? 1 : 0);
    if (s.hits >= 1 && score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  if (bestIndex >= 0) return bestIndex;

  // No recognised header words: if the first non-blank row has no emails/phones
  // and the next row does, treat the first row as the header anyway.
  const firstIdx = rows.findIndex(r => !isBlankRow(r));
  if (firstIdx < 0) return -1;
  const first = rowHeaderScore(rows[firstIdx]);
  const nextRow = rows.slice(firstIdx + 1).find(r => !isBlankRow(r));
  const next = nextRow ? rowHeaderScore(nextRow) : null;
  if (first.dataLike === 0 && next && next.dataLike > 0) return firstIdx;
  return -1;
};

export type ColumnInfo = {
  index: number;
  header: string;
  samples: string[];
  filled: number;
  role: ImportRole;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reason: string;
};

type ContentStats = {
  email: number;
  phone: number;
  country: number;
  dial: number;
  name: number;
  fullName: number;
  numeric: number;
  date: number;
  count: number;
};

const NON_NAME_WORDS = new Set(
  ['new', 'yes', 'no', 'true', 'false', 'male', 'female', 'm', 'f', 'n a', 'na', 'null', 'none', 'unknown', 'test',
   'active', 'inactive', 'pending', 'open', 'closed', 'lead', 'customer', 'interested', 'not interested', 'callback',
   'no answer', 'voicemail', 'busy', 'ftd', 'deposit', 'web', 'facebook', 'google', 'instagram', 'tiktok']
);

const contentStats = (values: string[]): ContentStats => {
  const vals = values.map(cleanCell).filter(Boolean).slice(0, 80);
  const s: ContentStats = { email: 0, phone: 0, country: 0, dial: 0, name: 0, fullName: 0, numeric: 0, date: 0, count: vals.length };
  vals.forEach(v => {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) s.email++;
    const digits = v.replace(/\D/g, '');
    const phoneChars = /^[+()\d\s.\-/e]+$/i.test(v.replace(/^(tel|phone)\s*:?\s*/i, ''));
    if (looksLikeDate(v) || /^\d{1,3}(\.\d{1,3}){3}$/.test(v)) s.date++;
    else if (phoneChars && digits.length >= 7 && digits.length <= 16) s.phone++;
    if (/^\+?\d{1,4}$/.test(v) && parseDialCode(v)) s.dial++;
    if (/^-?\d+([.,]\d+)?$/.test(v)) s.numeric++;
    if (canonicalCountry(v)) s.country++;
    const lettersOnly = /^[\p{L}][\p{L}\s.'’\-]{1,60}$/u.test(v);
    const words = v.split(/\s+/).filter(Boolean);
    if (lettersOnly && words.length <= 5 && !NON_NAME_WORDS.has(normalizeHeader(v)) && !canonicalCountry(v)) {
      s.name++;
      if (words.length >= 2) s.fullName++;
    }
  });
  return s;
};

const ratio = (n: number, total: number) => (total ? n / total : 0);

const MAPPING_STORE_KEY = 'crmImportMappings.v1';

const signatureOf = (headers: string[]) => headers.map(normalizeHeader).join('|');

const loadSavedMapping = (headers: string[]): Record<string, ImportRole> | null => {
  try {
    const all = JSON.parse(localStorage.getItem(MAPPING_STORE_KEY) || '{}');
    return all[signatureOf(headers)] || null;
  } catch {
    return null;
  }
};

export const saveMapping = (columns: ColumnInfo[]) => {
  try {
    const headers = columns.map(c => c.header);
    if (!headers.some(h => normalizeHeader(h))) return;
    const all = JSON.parse(localStorage.getItem(MAPPING_STORE_KEY) || '{}');
    const map: Record<string, ImportRole> = {};
    columns.forEach(c => (map[String(c.index)] = c.role));
    all[signatureOf(headers)] = map;
    const keys = Object.keys(all);
    if (keys.length > 60) keys.slice(0, keys.length - 60).forEach(k => delete all[k]);
    localStorage.setItem(MAPPING_STORE_KEY, JSON.stringify(all));
  } catch {}
};

export const columnLetter = (index: number) => {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

export function detectColumns(rows: string[][], headerRow: number): { columns: ColumnInfo[]; usedSaved: boolean } {
  const width = rows.reduce((max, r) => Math.max(max, r?.length || 0), 0);
  const header = headerRow >= 0 ? rows[headerRow] || [] : [];
  const dataRows = rows.slice(headerRow + 1).filter(r => !isBlankRow(r));

  const columns: ColumnInfo[] = [];
  for (let c = 0; c < width; c++) {
    const values = dataRows.map(r => cleanCell(r[c]));
    const nonEmpty = values.filter(Boolean);
    columns.push({
      index: c,
      header: cleanCell(header[c]) || `Column ${columnLetter(c)}`,
      samples: nonEmpty.slice(0, 3),
      filled: nonEmpty.length,
      role: 'ignore',
      confidence: 'none',
      reason: ''
    });
  }

  // Drop columns that are empty in both header and data.
  const visible = columns.filter(col => col.filled > 0 || (headerRow >= 0 && cleanCell(header[col.index])));

  const headers = visible.map(c => c.header);
  const saved = headerRow >= 0 ? loadSavedMapping(headers) : null;
  if (saved) {
    visible.forEach(col => {
      const role = saved[String(col.index)];
      if (role) {
        col.role = role;
        col.confidence = 'high';
        col.reason = 'Remembered from your last import of this layout';
      }
    });
    if (visible.every(col => saved[String(col.index)])) return { columns: visible, usedSaved: true };
  }

  type Candidate = { col: ColumnInfo; role: ImportRole; score: number; reason: string; stats: ContentStats };
  const candidates: Candidate[] = visible.map(col => {
    const values = dataRows.map(r => cleanCell(r[col.index])).filter(Boolean);
    const stats = contentStats(values);
    const hm = headerRow >= 0 ? headerMatch(col.header) : { role: 'ignore' as ImportRole, score: 0 };
    const emailR = ratio(stats.email, stats.count);
    const phoneR = ratio(stats.phone, stats.count);
    const countryR = ratio(stats.country, stats.count);
    const dialR = ratio(stats.dial, stats.count);

    let role: ImportRole = 'ignore';
    let score = 0;
    let reason = '';

    if (hm.score >= 55 && hm.role !== 'ignore') {
      role = hm.role;
      score = hm.score;
      reason = `Header "${col.header}"`;
    } else if (hm.role === 'ignore' && hm.score >= 90) {
      role = 'ignore';
      score = 90;
      reason = 'ID / row number column';
    }

    // Content wins over a wrong/unknown header — but not over a clear header for
    // IDs, notes, extra info, source, status, agent or country.
    const headerLocked = hm.score >= 90 && !['email', 'phone', 'phone2', 'name', 'first_name', 'last_name', 'middle_name'].includes(hm.role);
    if (stats.count >= 3) {
      if (emailR >= 0.6 && role !== 'email' && !headerLocked) {
        role = 'email';
        score = 70 + emailR * 30;
        reason = `${Math.round(emailR * 100)}% of values are emails`;
      } else if (phoneR >= 0.6 && emailR < 0.2 && role !== 'phone' && role !== 'phone2' && !headerLocked) {
        role = 'phone';
        score = 60 + phoneR * 30;
        reason = `${Math.round(phoneR * 100)}% of values are phone numbers`;
      } else if (phoneR >= 0.3 && phoneR + emailR >= 0.7 && role !== 'phone' && role !== 'phone2' && !headerLocked) {
        // "Contact" column with a phone on some rows and an email on others.
        role = 'phone';
        score = 50 + phoneR * 30;
        reason = 'Mixed phones and emails — phones used as Phone, emails picked up automatically';
      } else if (role === 'country' && countryR < 0.3 && dialR >= 0.6) {
        role = 'dial_code';
        score = 80;
        reason = 'Values look like dial codes (+44)';
      } else if (role === 'dial_code' && dialR < 0.4 && countryR >= 0.5) {
        role = 'country';
        score = 80;
        reason = 'Values look like countries';
      } else if (role === 'ignore' && score < 90 && countryR >= 0.6) {
        role = 'country';
        score = 55 + countryR * 30;
        reason = `${Math.round(countryR * 100)}% of values are countries`;
      }

      // Header said email/phone but the content clearly is not.
      if (role === 'email' && emailR < 0.15 && stats.count >= 5) {
        role = 'extra';
        score = 30;
        reason = `"${col.header}" has no valid emails`;
      }
      if ((role === 'phone' || role === 'phone2') && phoneR < 0.15 && stats.count >= 5) {
        role = ratio(stats.numeric, stats.count) > 0.8 ? 'ignore' : 'extra';
        score = 30;
        reason = `"${col.header}" has no phone numbers`;
      }
    }

    return { col, role, score, reason, stats };
  });

  // Headerless (or unknown headers): find the name column(s) by content.
  const hasNameRole = candidates.some(c => ['name', 'first_name', 'last_name'].includes(c.role));
  if (!hasNameRole) {
    const nameLike = candidates
      .filter(c => c.role === 'ignore' && c.score < 90 && c.stats.count >= 2 && ratio(c.stats.name, c.stats.count) >= 0.6)
      .sort((a, b) => a.col.index - b.col.index);
    const full = nameLike
      .filter(c => ratio(c.stats.fullName, c.stats.count) >= 0.5)
      .sort((a, b) => ratio(b.stats.fullName, b.stats.count) - ratio(a.stats.fullName, a.stats.count))[0];
    if (full) {
      full.role = 'name';
      full.score = 50;
      full.reason = 'Values look like full names';
    } else if (nameLike.length >= 2 && nameLike[1].col.index === nameLike[0].col.index + 1) {
      nameLike[0].role = 'first_name';
      nameLike[0].score = 45;
      nameLike[0].reason = 'Values look like first names';
      nameLike[1].role = 'last_name';
      nameLike[1].score = 45;
      nameLike[1].reason = 'Values look like last names';
    } else if (nameLike.length >= 1) {
      nameLike[0].role = 'name';
      nameLike[0].score = 40;
      nameLike[0].reason = 'Values look like names';
    }
  }

  // Only one column per single role; the rest fall back sensibly.
  SINGLE_ROLES.forEach(role => {
    const same = candidates.filter(c => c.role === role).sort((a, b) => b.score - a.score || a.col.index - b.col.index);
    same.slice(1).forEach(c => {
      c.role = role === 'phone' ? 'phone2' : 'extra';
      c.reason = `${c.reason} (another column is already ${role.replace('_', ' ')})`;
    });
  });

  // Name combinations: Nombre + Apellido, Имя + Фамилия, Prénom + Nom …
  const nameCol = candidates.find(c => c.role === 'name');
  const firstCol = candidates.find(c => c.role === 'first_name');
  const lastCol = candidates.find(c => c.role === 'last_name');
  if (nameCol && lastCol && !firstCol) {
    nameCol.role = 'first_name';
    nameCol.reason = `${nameCol.reason} — used as first name because "${lastCol.col.header}" is the last name`;
  } else if (nameCol && firstCol && !lastCol) {
    const fullR = ratio(nameCol.stats.fullName, nameCol.stats.count);
    if (fullR < 0.5 && AMBIGUOUS_NAME_HEADERS.has(normalizeHeader(nameCol.col.header))) {
      nameCol.role = 'last_name';
      nameCol.reason = `${nameCol.reason} — used as last name because "${firstCol.col.header}" is the first name`;
    } else {
      firstCol.role = 'extra';
      firstCol.reason = `${firstCol.reason} — full name column already exists`;
    }
  } else if (nameCol && firstCol && lastCol) {
    firstCol.role = 'extra';
    lastCol.role = 'extra';
  }

  candidates.forEach(c => {
    c.col.role = c.role;
    c.col.confidence = c.score >= 85 ? 'high' : c.score >= 55 ? 'medium' : c.score > 0 ? 'low' : 'none';
    c.col.reason = c.reason || (c.role === 'ignore' ? 'Not recognised' : '');
  });

  // Keep any remembered roles on top of the fresh guess.
  if (saved) {
    visible.forEach(col => {
      const role = saved[String(col.index)];
      if (role) {
        col.role = role;
        col.confidence = 'high';
        col.reason = 'Remembered from your last import of this layout';
      }
    });
  }

  return { columns: visible, usedSaved: false };
}

// Picks the sheet with the most usable rows.
export const pickBestSheet = (sheets: SheetGrid[]) => {
  let best = 0;
  let bestScore = -1;
  sheets.forEach((sheet, index) => {
    const nonBlank = sheet.rows.filter(r => !isBlankRow(r));
    const sample = nonBlank.slice(0, 40);
    const dataLike = sample.filter(r => r.some(c => parseEmail(c) || cleanCell(c).replace(/\D/g, '').length >= 7)).length;
    const score = nonBlank.length + dataLike * 50;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
};

// ---------------------------------------------------------------------------
// Building leads
// ---------------------------------------------------------------------------

export type BuiltLead = {
  name: string;
  email: string;
  phone: string;
  country: string;
  source: string; // from the file ('' when missing)
  status: string;
  assigned_to: string;
  notes: string;
  rowNumber: number;
};

export type SkippedRow = { rowNumber: number; reason: string; preview: string };

export type BuildResult = {
  leads: BuiltLead[];
  skipped: SkippedRow[];
  missingSource: number;
  unknownStatuses: Record<string, number>;
  unknownAgents: Record<string, number>;
  repeatedHeaders: number;
};

export type BuildContext = {
  statuses: string[]; // CRM status names
  users: Array<{ id: string; name?: string; email?: string }>;
  addPrefixToLocal: boolean;
  detectCountryFromPhone: (phone: string) => string;
};

export function buildLeads(rows: string[][], headerRow: number, columns: ColumnInfo[], ctx: BuildContext): BuildResult {
  const byRole = (role: ImportRole) => columns.filter(c => c.role === role);
  const one = (role: ImportRole) => byRole(role)[0];

  const nameC = one('name');
  const firstC = one('first_name');
  const middleC = one('middle_name');
  const lastC = one('last_name');
  const emailC = one('email');
  const phoneC = one('phone');
  const phone2Cs = byRole('phone2');
  const dialC = one('dial_code');
  const countryC = one('country');
  const sourceC = one('source');
  const statusC = one('status');
  const agentC = one('assigned_to');
  const notesCs = byRole('notes');
  const extraCs = byRole('extra');

  const statusMap = new Map<string, string>();
  ctx.statuses.forEach(s => statusMap.set(normalizeHeader(s), s));
  const userMap = new Map<string, string>();
  ctx.users.forEach(u => {
    if (u.id) userMap.set(String(u.id).toLowerCase(), u.id);
    if (u.email) userMap.set(String(u.email).trim().toLowerCase(), u.id);
    if (u.name) userMap.set(normalizeHeader(u.name), u.id);
  });

  const headerCells = headerRow >= 0 ? (rows[headerRow] || []).map(normalizeHeader) : [];
  const result: BuildResult = { leads: [], skipped: [], missingSource: 0, unknownStatuses: {}, unknownAgents: {}, repeatedHeaders: 0 };

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const rowNumber = r + 1;
    if (isBlankRow(row)) continue;
    const get = (col?: ColumnInfo) => (col ? cleanCell(row[col.index]) : '');

    // Header repeated in the middle (several files pasted together).
    if (headerCells.length) {
      const same = headerCells.filter((h, i) => h && h === normalizeHeader(row[i])).length;
      const filledHeaders = headerCells.filter(Boolean).length;
      if (filledHeaders && same / filledHeaders >= 0.6) {
        result.repeatedHeaders++;
        continue;
      }
    }

    const extraNotes: string[] = [];

    // Country first (needed for phone prefix).
    const countryRaw = get(countryC);
    let country = countryRaw ? canonicalCountry(countryRaw) || countryRaw : '';

    const dial = parseDialCode(get(dialC));
    const phoneOpts: PhoneOptions = { dialCode: dial, countryForPrefix: country, addPrefixToLocal: ctx.addPrefixToLocal };

    const phoneCandidates: string[] = [];
    if (phoneC) splitPhones(get(phoneC)).forEach(p => phoneCandidates.push(p));
    phone2Cs.forEach(c => splitPhones(get(c)).forEach(p => phoneCandidates.push(p)));
    const parsedPhones = phoneCandidates.map(p => parsePhone(p, phoneOpts)).filter(Boolean);
    const uniquePhones = Array.from(new Set(parsedPhones));
    const phone = uniquePhones[0] || '';
    if (uniquePhones.length > 1) extraNotes.push(`Other phone: ${uniquePhones.slice(1).join(', ')}`);

    let email = parseEmail(get(emailC));
    if (!email && !emailC) {
      // No email column: pick an email that appears anywhere in the row.
      const anyEmail = row.map(parseEmail).find(Boolean);
      if (anyEmail) email = anyEmail;
    }

    let name = '';
    if (nameC) name = cleanName(get(nameC));
    if (!name) {
      const parts = [cleanName(get(firstC)), cleanName(get(middleC)), cleanName(get(lastC))].filter(Boolean);
      name = parts.join(' ').trim();
    }
    if (!name && email) name = nameFromEmail(email);
    if (!name && phone) name = phone;

    if (!name && !phone && !email) {
      result.skipped.push({ rowNumber, reason: 'No name, phone or email', preview: row.filter(Boolean).slice(0, 4).join(' · ').slice(0, 80) });
      continue;
    }
    if (!phone && !email && phoneC && get(phoneC)) {
      extraNotes.push(`Original phone: ${get(phoneC)}`);
    }

    // Guess the country from the phone only when the number is international
    // (+…, 00…, or long enough to carry a country code).
    if (!country && phone && (phone.startsWith('+') || phone.replace(/\D/g, '').length >= 11)) {
      country = ctx.detectCountryFromPhone(phone);
    }

    // Status: match CRM statuses case-insensitively; unknown → New (+ note).
    const statusRaw = get(statusC);
    let status = 'New';
    if (statusRaw) {
      const match = statusMap.get(normalizeHeader(statusRaw));
      if (!statusMap.size) status = statusRaw; // statuses not loaded: keep file value (old behaviour)
      else if (match) status = match;
      else {
        result.unknownStatuses[statusRaw] = (result.unknownStatuses[statusRaw] || 0) + 1;
        extraNotes.push(`Original status: ${statusRaw}`);
      }
    }

    // Agent: match by CRM user id / email / name; unknown → unassigned (+ note).
    const agentRaw = get(agentC);
    let assigned_to = '';
    if (agentRaw) {
      const match = userMap.get(agentRaw.toLowerCase()) || userMap.get(normalizeHeader(agentRaw));
      if (!userMap.size) assigned_to = agentRaw; // users not loaded: keep file value (old behaviour)
      else if (match) assigned_to = match;
      else {
        result.unknownAgents[agentRaw] = (result.unknownAgents[agentRaw] || 0) + 1;
        extraNotes.push(`Original agent: ${agentRaw}`);
      }
    }

    const source = get(sourceC);
    if (!source) result.missingSource++;

    const noteParts: string[] = [];
    notesCs.forEach(c => {
      const v = get(c);
      if (v) noteParts.push(notesCs.length > 1 ? `${c.header}: ${v}` : v);
    });
    extraCs.forEach(c => {
      const v = get(c);
      if (v) noteParts.push(`${c.header}: ${v}`);
    });
    if (countryRaw && country && normalizeHeader(countryRaw) !== normalizeHeader(country) && countryRaw.length > 3) {
      // Keep the original spelling only when it carried extra info ("Germany - Berlin").
      if (!canonicalCountry(countryRaw)) noteParts.push(`Country: ${countryRaw}`);
    }
    noteParts.push(...extraNotes);

    result.leads.push({
      name,
      email,
      phone,
      country,
      source,
      status,
      assigned_to,
      notes: noteParts.join('\n'),
      rowNumber
    });
  }

  return result;
}
