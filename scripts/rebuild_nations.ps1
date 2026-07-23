# Rebuild data/nations_v2.json: keep ~78 playable 1936 nations, fix ideologies/leaders/population/military.
$ErrorActionPreference = 'Stop'
$projectRoot = 'C:\Users\Francesco\Videos\projects\Local-Pax-Historia'

$rawPath = Join-Path $projectRoot 'data\nations_v2.json'
$raw = Get-Content $rawPath -Raw | ConvertFrom-Json

# --- Curated nation metadata ---
# ideology: fascism | democratic | communist | authoritarian
# is_major_power: mirrors HOI4 1936 majors (7) + China/Japan-aligned tie-breakers
$curated = [ordered]@{
  'GER' = @{name='German Reich';              leader_name='Adolf Hitler';           leader_title='Führer';              ideology='fascism';       population=65600000;  military_strength=78; capital='Berlin';          is_major_power=$true;  color='#6a7759'}
  'ITA' = @{name='Kingdom of Italy';          leader_name='Benito Mussolini';       leader_title='Il Duce';             ideology='fascism';       population=41900000;  military_strength=58; capital='Rome';            is_major_power=$true;  color='#437f3f'}
  'JAP' = @{name='Empire of Japan';           leader_name='Hirohito';               leader_title='Emperor';             ideology='fascism';       population=71000000;  military_strength=72; capital='Tokyo';           is_major_power=$true;  color='#ffbfbf'}
  'HUN' = @{name='Kingdom of Hungary';        leader_name='Miklos Horthy';          leader_title='Regent';              ideology='fascism';       population=9100000;   military_strength=32; capital='Budapest';        is_major_power=$false; color='#5a705a'}
  'ROM' = @{name='Kingdom of Romania';        leader_name='Carol II';               leader_title='King';                ideology='fascism';       population=18900000;  military_strength=30; capital='Bucharest';       is_major_power=$false; color='#ebd85c'}
  'BUL' = @{name='Tsardom of Bulgaria';       leader_name='Boris III';              leader_title='Tsar';                ideology='fascism';       population=6080000;   military_strength=28; capital='Sofia';           is_major_power=$false; color='#427145'}
  'FIN' = @{name='Finland';                   leader_name='Kyosti Kallio';          leader_title='President';          ideology='authoritarian'; population=3810000;   military_strength=35; capital='Helsinki';        is_major_power=$false; color='#cdd4e4'}
  'DOM' = @{name='Dominican Republic';        leader_name='Rafael Trujillo';        leader_title='President';          ideology='fascism';       population=1250000;   military_strength=10; capital='Santo Domingo';   is_major_power=$false; color='#9b3e33'}
  'ELS' = @{name='El Salvador';               leader_name='Maximiliano Martinez';  leader_title='President';          ideology='fascism';       population=1430000;   military_strength=8;  capital='San Salvador';    is_major_power=$false; color='#fdbf6f'}
  'ENG' = @{name='United Kingdom';            leader_name='Stanley Baldwin';        leader_title='Prime Minister';     ideology='democratic';    population=46700000;  military_strength=85; capital='London';          is_major_power=$true;  color='#c9385d'}
  'FRA' = @{name='French Republic';           leader_name='Albert Lebrun';         leader_title='President';          ideology='democratic';    population=42250000;  military_strength=70; capital='Paris';           is_major_power=$true;  color='#3971e4'}
  'USA' = @{name='United States';             leader_name='Franklin D. Roosevelt'; leader_title='President';          ideology='democratic';    population=125000000; military_strength=60; capital='Washington';       is_major_power=$true;  color='#437bed'}
  'CAN' = @{name='Dominion of Canada';        leader_name='William Lyon Mackenzie King'; leader_title='Prime Minister'; ideology='democratic';  population=10220000; military_strength=35; capital='Ottawa';          is_major_power=$false; color='#fcd116'}
  'AST' = @{name='Australia';                 leader_name='Joseph Lyons';           leader_title='Prime Minister';     ideology='democratic';    population=6760000;   military_strength=33; capital='Canberra';         is_major_power=$false; color='#d4801c'}
  'NZL' = @{name='New Zealand';              leader_name='Michael Joseph Savage';  leader_title='Prime Minister';     ideology='democratic';    population=1500000;   military_strength=15; capital='Wellington';       is_major_power=$false; color='#0e2a72'}
  'BEL' = @{name='Belgium';                   leader_name='Leopold III';            leader_title='King';                ideology='democratic';    population=8130000;   military_strength=25; capital='Brussels';         is_major_power=$false; color='#c1ab08'}
  'HOL' = @{name='Netherlands';               leader_name='Wilhelmina';             leader_title='Queen';              ideology='democratic';    population=7900000;   military_strength=22; capital='Amsterdam';        is_major_power=$false; color='#cb8a4a'}
  'CZE' = @{name='Czechoslovakia';            leader_name='Edvard Benes';          leader_title='President';          ideology='democratic';    population=15040000;  military_strength=36; capital='Prague';           is_major_power=$false; color='#36a79c'}
  'DEN' = @{name='Denmark';                   leader_name='Christian X';            leader_title='King';               ideology='democratic';    population=3750000;   military_strength=18; capital='Copenhagen';       is_major_power=$false; color='#7d0000'}
  'NOR' = @{name='Norway';                    leader_name='Haakon VII';            leader_title='King';               ideology='democratic';    population=2900000;   military_strength=15; capital='Oslo';             is_major_power=$false; color='#3fa7ff'}
  'SWE' = @{name='Sweden';                    leader_name='Gustav V';               leader_title='King';               ideology='democratic';    population=6250000;   military_strength=22; capital='Stockholm';        is_major_power=$false; color='#2484f7'}
  'IRE' = @{name='Irish Free State';          leader_name='Eamon de Valera';        leader_title='Taoiseach';          ideology='democratic';    population=3000000;   military_strength=12; capital='Dublin';           is_major_power=$false; color='#1a8c4f'}
  'POL' = @{name='Poland';                    leader_name='Ignacy Moscicki';        leader_title='President';          ideology='authoritarian'; population=32100000;  military_strength=40; capital='Warsaw';           is_major_power=$false; color='#961717'}
  'TUR' = @{name='Republic of Turkey';        leader_name='Mustafa Kemal Ataturk';  leader_title='President';          ideology='authoritarian'; population=17000000;  military_strength=28; capital='Ankara';           is_major_power=$false; color='#abbe98'}
  'GRE' = @{name='Kingdom of Greece';         leader_name='George II';              leader_title='King';               ideology='authoritarian'; population=6270000;   military_strength=20; capital='Athens';           is_major_power=$false; color='#5db5e3'}
  'YUG' = @{name='Yugoslavia';               leader_name='Peter II';               leader_title='King';               ideology='authoritarian'; population=15000000;  military_strength=25; capital='Belgrade';         is_major_power=$false; color='#48497e'}
  'POR' = @{name='Portugal';                  leader_name='Antonio Salazar';        leader_title='Prime Minister';     ideology='authoritarian'; population=7200000;   military_strength=18; capital='Lisbon';           is_major_power=$false; color='#347436'}
  'AUS' = @{name='Austria';                   leader_name='Kurt Schuschnigg';       leader_title='Chancellor';         ideology='authoritarian'; population=6430000;   military_strength=24; capital='Vienna';           is_major_power=$false; color='#e0e4ff'}
  'SPR' = @{name='Spanish Republic';          leader_name='Manuel Azana';           leader_title='President';          ideology='democratic';    population=24100000;  military_strength=28; capital='Madrid';           is_major_power=$false; color='#c60b3e'}
  'ARG' = @{name='Argentina';                 leader_name='Agustin Pedro Justo';    leader_title='President';          ideology='democratic';    population=16890000;  military_strength=24; capital='Buenos Aires';     is_major_power=$false; color='#74acdf'}
  'BRA' = @{name='Second Brazilian Republic'; leader_name='Getulio Vargas';         leader_title='President';          ideology='democratic';    population=44020000;  military_strength=33; capital='Rio de Janeiro';  is_major_power=$false; color='#1f9c3f'}
  'CHL' = @{name='Chile';                     leader_name='Arturo Alessandri';     leader_title='President';          ideology='democratic';    population=5060000;   military_strength=15; capital='Santiago';         is_major_power=$false; color='#0038a8'}
  'COL' = @{name='Colombia';                  leader_name='Alfonso Lopez Pumarejo'; leader_title='President';         ideology='democratic';    population=8000000;   military_strength=12; capital='Bogota';           is_major_power=$false; color='#fcd116'}
  'VEN' = @{name='Venezuela';                 leader_name='Eleazar Lopez Contreras';leader_title='President';         ideology='authoritarian'; population=3470000;   military_strength=12; capital='Caracas';          is_major_power=$false; color='#ffce00'}
  'PER' = @{name='Imperial State of Iran';   leader_name='Reza Shah Pahlavi';      leader_title='Shah';               ideology='authoritarian'; population=16000000;  military_strength=22; capital='Tehran';           is_major_power=$false; color='#5eb8d4'}
  'SAU' = @{name='Saudi Arabia';              leader_name='Ibn Saud';              leader_title='King';               ideology='authoritarian'; population=2400000;   military_strength=8;  capital='Riyadh';          is_major_power=$false; color='#1a8c4f'}
  'SAF' = @{name='Union of South Africa';    leader_name='J.B.M. Hertzog';         leader_title='Prime Minister';     ideology='democratic';    population=9600000;   military_strength=25; capital='Pretoria';         is_major_power=$false; color='#007a4d'}
  'MEX' = @{name='Mexico';                   leader_name='Lazaro Cardenas';        leader_title='President';          ideology='democratic';    population=19300000;  military_strength=20; capital='Mexico City';     is_major_power=$false; color='#1a8c4f'}
  'SOV' = @{name='Soviet Union';              leader_name='Iosif Stalin';           leader_title='General Secretary';  ideology='communist';     population=162000000; military_strength=78; capital='Moscow';          is_major_power=$true;  color='#7d0d18'}
  'MON' = @{name='Mongolian People''s Republic'; leader_name='Khorloogiin Choibalsan'; leader_title='General Secretary'; ideology='communist'; population=750000;  military_strength=10; capital='Ulaanbaatar';      is_major_power=$false; color='#ce1126'}
  'TAN' = @{name='Tuvan People''s Republic';  leader_name='Donduk-Choo-Oglu';       leader_title='Chairman';           ideology='communist';     population=65000;     military_strength=4;  capital='Kyzyl';           is_major_power=$false; color='#d62612'}
  'PRC' = @{name='Chinese Soviet Republic';   leader_name='Mao Zedong';             leader_title='Chairman';           ideology='communist';     population=2330000;   military_strength=10; capital="Yan'an";          is_major_power=$false; color='#ce1126'}
  'ETH' = @{name='Ethiopian Empire';          leader_name='Haile Selassie I';       leader_title='Emperor';            ideology='authoritarian'; population=9910000;   military_strength=18; capital='Addis Ababa';     is_major_power=$false; color='#9882bf'}
  'CHI-X'= @{placeholder=$true}
  'INC-X'= @{placeholder=$true}
}
$curated.Remove('CHI-X')
$curated.Remove('INC-X')

# Add China warlord cliques (historically active in 1936, allied or independent)
$curated['CHI'] = @{name='Republic of China';           leader_name='Chiang Kai-shek'; leader_title='Generalissimo'; ideology='authoritarian'; population=210860000; military_strength=35; capital='Nanjing';   is_major_power=$true;  color='#28288c'}
$curated['GXC'] = @{name='Guangxi Clique';               leader_name='Li Zongren';     leader_title='General';       ideology='authoritarian'; population=11970000;  military_strength=12; capital='Nanning';    is_major_power=$false; color='#5387a8'}
$curated['XSM'] = @{name='Xibei San Ma';                 leader_name='Ma Bufang';      leader_title='General';        ideology='authoritarian'; population=7500000;   military_strength=10; capital="Xi'an";      is_major_power=$false; color='#74a464'}
$curated['YUN'] = @{name='Yunnan';                       leader_name='Long Yun';        leader_title='General';       ideology='authoritarian'; population=10000000;  military_strength=11; capital='Kunming';    is_major_power=$false; color='#9c8c1a'}
$curated['SIA'] = @{name='Siam';                         leader_name='Prajadhipok';    leader_title='King';          ideology='authoritarian'; population=12200000;  military_strength=14; capital='Bangkok';    is_major_power=$false; color='#a51931'}
$curated['PHI'] = @{name='Commonwealth of the Philippines'; leader_name='Manuel Quezon'; leader_title='President';   ideology='democratic';    population=14000000;  military_strength=12; capital='Manila';     is_major_power=$false; color='#0038a8'}
$curated['INS'] = @{name='Dutch East Indies';            leader_name='Bonifacius C. de Jonge'; leader_title='Governor-General'; ideology='authoritarian'; population=48530000; military_strength=18; capital='Batavia';   is_major_power=$false; color='#cb8a4a'}
$curated['RAJ'] = @{name='British Raj';                 leader_name='Victor Hope';     leader_title='Viceroy';        ideology='authoritarian'; population=251180000; military_strength=40; capital='Delhi';      is_major_power=$false; color='#9a7d0a'}
$curated['MAN'] = @{name='Manchukuo';                    leader_name='Puyi';            leader_title='Emperor';        ideology='authoritarian'; population=32500000;  military_strength=14; capital='Hsinking';   is_major_power=$false; color='#fcd116'}
$curated['MEN'] = @{name='Mengjiang';                    leader_name='Demchugdongrub';  leader_title='Chairman';       ideology='authoritarian'; population=4500000;   military_strength=8;  capital='Kalgan';     is_major_power=$false; color='#b53932'}
$curated['AFG'] = @{name='Kingdom of Afghanistan';       leader_name='Mohammed Zahir Shah'; leader_title='King';       ideology='authoritarian'; population=6610000;   military_strength=10; capital='Kabul';      is_major_power=$false; color='#1a8c4f'}
$curated['IRQ'] = @{name='Kingdom of Iraq';              leader_name='Ghazi of Iraq';   leader_title='King';           ideology='authoritarian'; population=3000000;   military_strength=8;  capital='Baghdad';    is_major_power=$false; color='#007a3d'}
$curated['EGY'] = @{name='Kingdom of Egypt';             leader_name='Farouk I';        leader_title='King';           ideology='authoritarian'; population=16900000;  military_strength=18; capital='Cairo';      is_major_power=$false; color='#c8102e'}
$curated['TIB'] = @{name='Tibet';                        leader_name='Thubten Gyatso';  leader_title='Dalai Lama';     ideology='authoritarian'; population=1000000;   military_strength=3;  capital='Lhasa';     is_major_power=$false; color='#fe5000'}
$curated['SIK'] = @{name='Sikang';                       leader_name='Liu Wenhui';      leader_title='General';        ideology='authoritarian'; population=4500000;   military_strength=8;  capital='Kangding';    is_major_power=$false; color='#ad6f8e'}
$curated['OMA'] = @{name='Sultanate of Muscat and Oman'; leader_name='Said bin Taimur';leader_title='Sultan';          ideology='authoritarian'; population=500000;   military_strength=5;  capital='Muscat';     is_major_power=$false; color='#c8102e'}
$curated['ALB'] = @{name='Albanian Kingdom';             leader_name='Zog I';           leader_title='King';           ideology='authoritarian'; population=1000000;   military_strength=10; capital='Tirana';     is_major_power=$false; color='#c8102e'}
$curated['LUX'] = @{name='Luxembourg';                   leader_name='Charlotte';       leader_title='Grand Duchess';  ideology='democratic';    population=300000;    military_strength=4;  capital='Luxembourg'; is_major_power=$false; color='#37c2d4'}
$curated['ICE'] = @{name='Iceland';                      leader_name='Kristjan X';      leader_title='King';           ideology='democratic';    population=120000;    military_strength=2;  capital='Reykjavik';   is_major_power=$false; color='#003897'}
$curated['LIB'] = @{name='Liberia';                      leader_name='Edwin Barclay';   leader_title='President';       ideology='democratic';    population=1500000;   military_strength=5;  capital='Monrovia';    is_major_power=$false; color='#bf0a30'}
$curated['CUB'] = @{name='Cuba';                         leader_name='Federico Laredo Bru'; leader_title='President';  ideology='authoritarian'; population=3610000;   military_strength=8;  capital='Havana';     is_major_power=$false; color='#002a8f'}
$curated['ECU'] = @{name='Ecuador';                      leader_name='Federico Paez';   leader_title='President';      ideology='authoritarian'; population=2080000;   military_strength=8;  capital='Quito';       is_major_power=$false; color='#ffd100'}
$curated['BOL'] = @{name='Bolivian Republic';           leader_name='Jose Luis Tejada Sorzano'; leader_title='President'; ideology='democratic';   population=2380000;   military_strength=8;  capital='Sucre';     is_major_power=$false; color='#da0000'}
$curated['PAR'] = @{name='Paraguay';                     leader_name='Eusebio Ayala';   leader_title='President';      ideology='authoritarian'; population=1000000;   military_strength=8;  capital='Asuncion';    is_major_power=$false; color='#d52b1e'}
$curated['URG'] = @{name='Uruguay';                      leader_name='Gabriel Terra';   leader_title='President';       ideology='democratic';    population=1900000;   military_strength=9;  capital='Montevideo'; is_major_power=$false; color='#5cb7f7'}
$curated['HYD'] = @{name='Hyderabad';                    leader_name='Mir Osman Ali Khan'; leader_title='Nizam';       ideology='authoritarian'; population=14700000;  military_strength=15; capital='Hyderabad'; is_major_power=$false; color='#c8a64b'}
$curated['GLC'] = @{name='Galicia';                      leader_name='Unknown';         leader_title='-';               ideology='authoritarian'; population=6000000;   military_strength=10; capital='Lwow';       is_major_power=$false; color='#6a7759'}
$curated['DNZ'] = @{name='Free City of Danzig';         leader_name='Arthur Greiser';  leader_title='Senate President';ideology='fascism';       population=400000;    military_strength=4;  capital='Danzig';     is_major_power=$false; color='#7bad4f'}
$curated['JOR'] = @{name='Emirate of Transjordan';       leader_name='Abdullah I';      leader_title='Emir';           ideology='authoritarian'; population=300000;    military_strength=4;  capital='Amman';      is_major_power=$false; color='#ce1126'}
$curated['LEB'] = @{name='Lebanese Republic';            leader_name='Emile Eddé';      leader_title='President';      ideology='democratic';    population=1100000;   military_strength=6;  capital='Beirut';      is_major_power=$false; color='#d62612'}
$curated['CAM' ]= @{name='French Cambodia';              leader_name='Sisowath Monivong';leader_title='King';           ideology='authoritarian'; population=3000000;   military_strength=6;  capital='Phnom Penh'; is_major_power=$false; color='#003897'}
$curated['LAO'] = @{name='French Laos';                  leader_name='Sisavang Vong';   leader_title='King';           ideology='authoritarian'; population=1200000;   military_strength=5;  capital='Vientiane'; is_major_power=$false; color='#003897'}
$curated['KUW'] = @{name='Sheikhdom of Kuwait';          leader_name='Ahmad Al-Jaber Al-Sabah'; leader_title='Emir';     ideology='authoritarian'; population=80000;     military_strength=2;  capital='Kuwait City';is_major_power=$false; color='#007a3d'}
$curated['YEM'] = @{name='Mutawakkilite Kingdom of Yemen';leader_name='Yahya Muhammad Hamid ed-Din'; leader_title='King'; ideology='authoritarian'; population=3000000;  military_strength=6;  capital="Sana'a";     is_major_power=$false; color='#d62612'}
$curated['PHI2']= @{placeholder=$true}
$curated.Remove('PHI2')

# --- Build final object (preserve source-order of keys by sorting alphabetically) ---
$final = [ordered]@{}
$keys = $curated.Keys | Sort-Object
foreach ($k in $keys) {
  $src = $raw.$k  # may be $null if not present in source
  $c = $curated[$k]
  $entry = [ordered]@{
    code             = $k
    name             = $c.name
    ideology         = $c.ideology
    is_major_power   = [bool]$c.is_major_power
    leader_name      = $c.leader_name
    leader_title     = $c.leader_title
    population       = [int64]$c.population
    military_strength= [int]$c.military_strength
    color            = $c.color
    capital          = $c.capital
  }
  if ($src -and $src.filePath) { $entry.filePath = $src.filePath }  # keep for reference
  $final[$k] = $entry
}

# --- Write JSON ---
$dest = Join-Path $projectRoot 'data\nations_v2.json'
# Use .NET to write UTF-8 (no BOM) JSON
$jsonObj = [pscustomobject]$final
$json = $jsonObj | ConvertTo-Json -Depth 10
# Indent conversion: ConvertTo-Json already uses 4-space indent; that's fine.
[System.IO.File]::WriteAllText($dest, $json, [System.Text.UTF8Encoding]::new($false))
Write-Output ("Wrote {0} nations to {1}" -f $final.Count, $dest)
