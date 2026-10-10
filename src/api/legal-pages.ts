/*
 * Public pages Google Play asks for: the privacy policy and the
 * account deletion page. Served as plain HTML at /gizlilik, /privacy,
 * /hesap-silme and /delete-account (also on twohorse.app once the
 * domain points at this worker).
 */
const SUPPORT = "twohorse.support@gmail.com";
const UPDATED_TR = "10 Ekim 2026";
const UPDATED_EN = "10 October 2026";

function page(lang: "tr" | "en", title: string, body: string): Response {
  const html = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{margin:0;background:#F8F5EF;color:#1F2A24;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px 48px}
h1{font-size:26px;margin:0 0 4px}
h2{font-size:18px;margin:28px 0 6px}
.muted{color:#6B7570;font-size:14px}
a{color:#1E6B45}
ul{padding-left:20px}
.box{background:#F0EBE1;border:1px solid #E2DACB;border-radius:12px;padding:14px 16px;margin:16px 0}
</style>
</head>
<body><main>${body}</main></body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=3600"
    }
  });
}

const PRIVACY_TR = `
<h1>Two Horse Gizlilik Politikası</h1>
<p class="muted">Son güncelleme: ${UPDATED_TR} · <a href="/privacy">English</a></p>

<p>Bu metin Two Horse uygulamasını kullanırken hangi bilgilerini işlediğimizi, neden işlediğimizi ve haklarını anlatır. Sorular için: <a href="mailto:${SUPPORT}">${SUPPORT}</a>.</p>

<h2>Topladığımız bilgiler</h2>
<ul>
<li><b>Hesap bilgileri:</b> e-posta adresin, istersen adın. Google ile girersen Google hesabının kimlik numarası ve e-postası.</li>
<li><b>Şifre:</b> şifren açık hâliyle saklanmaz; yalnızca geri çevrilemeyen güvenli özeti tutulur.</li>
<li><b>Üyelik bilgileri:</b> paketin (Ücretsiz, Gold, Premium), deneme süren ve Google Play abonelik kaydın. Kart ve ödeme bilgilerin Google'da kalır, bize gelmez.</li>
<li><b>Uygulama içi kullanım:</b> günlük kupon ve "AI'ya sor" sınırları için o gün kaç kupon oluşturduğun ve kaç soru sorduğun; "Kuponlarım"a kendin kaydettiğin kuponlar. Soru metinleri kaydedilmez.</li>
<li><b>Şifre sıfırlama:</b> "Şifremi unuttum" dediğinde 15 dakika geçerli bir kodun özeti; kod kullanılınca silinir.</li>
</ul>
<p>Uygulamada reklam yoktur, reklam veya analitik takip aracı kullanmayız, konum ve rehber gibi telefon verilerine erişmeyiz.</p>

<h2>Bilgileri neden kullanıyoruz</h2>
<ul>
<li>Hesabını açmak, girişini sağlamak ve şifreni sıfırlayabilmek.</li>
<li>Üyelik paketini ve günlük sınırlarını uygulamak, aboneliğini Google Play ile doğrulamak.</li>
<li>Destek taleplerine cevap vermek.</li>
</ul>

<h2>Kimlerle paylaşıyoruz</h2>
<p>Bilgilerini satmayız ve reklam için paylaşmayız. Hizmeti çalıştırmak için şu sağlayıcıları kullanırız:</p>
<ul>
<li><b>Cloudflare:</b> sunucu, veritabanı, e-posta gönderimi ve "AI'ya sor" cevaplarını üreten yapay zekâ altyapısı.</li>
<li><b>Google:</b> Google ile giriş ve Google Play üzerinden abonelik ödemeleri.</li>
</ul>
<p>Bu sağlayıcıların sunucuları Türkiye dışında olabilir; bilgilerin bu nedenle yurt dışında işlenebilir.</p>

<h2>Ne kadar saklıyoruz</h2>
<p>Bilgilerin hesabın açık kaldığı sürece saklanır. Hesabını sildiğinde hesap bilgilerin, kuponların ve kullanım kayıtların silinir. Ücretsiz deneme hakkının aynı e-postayla tekrar kullanılmaması için yalnızca e-postanın geri çevrilemeyen bir özeti tutulur. Google Play'deki ödeme kayıtları Google'ın kendi kurallarına göre saklanır.</p>

<h2>Hakların</h2>
<p>6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 11. maddesi kapsamında bilgilerinin işlenip işlenmediğini öğrenme, düzeltilmesini veya silinmesini isteme gibi haklara sahipsin. Talebini <a href="mailto:${SUPPORT}">${SUPPORT}</a> adresine yazabilirsin. Hesabını uygulamadan da silebilirsin: <a href="/hesap-silme">Hesap silme</a>.</p>

<h2>Önemli not</h2>
<p>Two Horse 18 yaş ve üzeri içindir. Uygulama bahis almaz, bahis sitelerine yönlendirmez; gösterilen tahminler bahis tavsiyesi değildir.</p>

<h2>Değişiklikler</h2>
<p>Bu metni güncellediğimizde yeni tarihi bu sayfada yayınlarız.</p>
`;

const PRIVACY_EN = `
<h1>Two Horse Privacy Policy</h1>
<p class="muted">Last updated: ${UPDATED_EN} · <a href="/gizlilik">Türkçe</a></p>

<p>This page explains what information the Two Horse app processes, why, and what your rights are. Questions: <a href="mailto:${SUPPORT}">${SUPPORT}</a>.</p>

<h2>What we collect</h2>
<ul>
<li><b>Account details:</b> your email address and, if you give it, your name. If you sign in with Google, your Google account ID and email.</li>
<li><b>Password:</b> never stored in plain text; only a one-way secure hash is kept.</li>
<li><b>Membership:</b> your plan (Free, Gold, Premium), your trial period and your Google Play subscription record. Card and payment details stay with Google and never reach us.</li>
<li><b>In-app usage:</b> how many coupons you built and questions you asked today, for the daily limits, and the coupons you save to "My coupons". Question texts are not stored.</li>
<li><b>Password reset:</b> a hash of a reset code that is valid for 15 minutes and deleted once used.</li>
</ul>
<p>The app shows no ads, uses no advertising or analytics trackers, and does not access phone data such as location or contacts.</p>

<h2>Why we use it</h2>
<ul>
<li>To create your account, sign you in and let you reset your password.</li>
<li>To apply your plan and daily limits and to verify your subscription with Google Play.</li>
<li>To answer support requests.</li>
</ul>

<h2>Who we share it with</h2>
<p>We do not sell your information or share it for advertising. We use these providers to run the service:</p>
<ul>
<li><b>Cloudflare:</b> servers, database, email delivery and the AI that answers "Ask AI" questions.</li>
<li><b>Google:</b> Google sign-in and subscription payments through Google Play.</li>
</ul>
<p>These providers may process data on servers outside Turkey.</p>

<h2>How long we keep it</h2>
<p>We keep your information while your account is open. When you delete your account, your account details, coupons and usage records are deleted. To stop the free trial from being reused with the same email, only a one-way hash of the email is kept. Payment records at Google Play are kept under Google's own rules.</p>

<h2>Your rights</h2>
<p>Under Turkey's Personal Data Protection Law (KVKK, Law No. 6698, Article 11) you can ask whether your data is processed and ask for it to be corrected or deleted. Write to <a href="mailto:${SUPPORT}">${SUPPORT}</a>. You can also delete your account in the app: <a href="/delete-account">Account deletion</a>.</p>

<h2>Important</h2>
<p>Two Horse is for people aged 18 and over. The app takes no bets and does not link to betting sites; its predictions are not betting advice.</p>

<h2>Changes</h2>
<p>When we update this policy we publish the new date on this page.</p>
`;

const DELETE_TR = `
<h1>Two Horse hesabını silme</h1>
<p class="muted"><a href="/delete-account">English</a></p>

<h2>Uygulamadan silmek</h2>
<div class="box">Two Horse uygulamasını aç → sağ üstteki <b>hesap</b> simgesi → <b>Hesabımı Sil</b> → onayla.</div>

<h2>Uygulamaya giremiyorsan</h2>
<p>Hesabının e-posta adresinden <a href="mailto:${SUPPORT}?subject=Hesap%20silme">${SUPPORT}</a> adresine "Hesap silme" konulu bir mail gönder. Talebini 7 gün içinde yerine getirir ve sana yazarız.</p>

<h2>Neler silinir</h2>
<ul>
<li>E-posta, ad, şifre özeti ve Google hesap kimliği.</li>
<li>"Kuponlarım"daki kuponların, günlük kupon ve soru kayıtların.</li>
<li>Bizdeki abonelik kaydın.</li>
</ul>
<p>Ücretsiz deneme hakkının tekrar kullanılmaması için yalnızca e-postanın geri çevrilemeyen bir özeti saklanır. Hesabı silmek Google Play aboneliğini iptal etmez; aboneliği Google Play → Ödemeler ve abonelikler bölümünden iptal etmelisin.</p>
`;

const DELETE_EN = `
<h1>Delete your Two Horse account</h1>
<p class="muted"><a href="/hesap-silme">Türkçe</a></p>

<h2>In the app</h2>
<div class="box">Open the Two Horse app → tap the <b>account</b> icon at the top right → <b>Delete My Account</b> → confirm.</div>

<h2>If you cannot sign in</h2>
<p>From your account's email address, send an email with the subject "Account deletion" to <a href="mailto:${SUPPORT}?subject=Account%20deletion">${SUPPORT}</a>. We complete the request within 7 days and reply to you.</p>

<h2>What is deleted</h2>
<ul>
<li>Your email, name, password hash and Google account ID.</li>
<li>Your saved coupons and your daily coupon and question records.</li>
<li>Our record of your subscription.</li>
</ul>
<p>To stop the free trial from being reused, only a one-way hash of your email is kept. Deleting your account does not cancel a Google Play subscription; cancel it in Google Play → Payments &amp; subscriptions.</p>
`;

const HOME = `
<h1>Two Horse</h1>
<p>Türkiye at yarışları için program, AGF, sonuçlar ve model tahminleri sunan Android uygulaması. Uygulama bahis almaz, bahis sitelerine yönlendirmez; tahminler bahis tavsiyesi değildir. 18 yaş ve üzeri içindir.</p>
<p class="muted">An Android app with race programs, odds, results and model-based predictions for horse racing in Turkey. It takes no bets and does not link to betting sites; predictions are not betting advice. For ages 18 and over.</p>
<div class="box">
<a href="/gizlilik">Gizlilik Politikası</a> · <a href="/privacy">Privacy Policy</a><br>
<a href="/hesap-silme">Hesap silme</a> · <a href="/delete-account">Account deletion</a><br>
İletişim / Contact: <a href="mailto:${SUPPORT}">${SUPPORT}</a>
</div>
`;

export function legalPage(pathname: string): Response | null {
  switch (pathname.replace(/\/+$/, "")) {
    case "":
      return page("tr", "Two Horse", HOME);
    case "/gizlilik":
      return page("tr", "Two Horse Gizlilik Politikası", PRIVACY_TR);
    case "/privacy":
      return page("en", "Two Horse Privacy Policy", PRIVACY_EN);
    case "/hesap-silme":
      return page("tr", "Two Horse Hesap Silme", DELETE_TR);
    case "/delete-account":
      return page("en", "Two Horse Account Deletion", DELETE_EN);
    default:
      return null;
  }
}
