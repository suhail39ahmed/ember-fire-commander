import type { Localized, PracticeResponse } from '../contracts/types'

const copy = (en: string, id: string): Localized => ({ en, id })
export function practiceFixture(lessonId: string | undefined, message: string, index: number): Omit<PracticeResponse, 'turnId'> & { correctId: string; feedback: Localized } {
  const topic = lessonId || (/wind|angin|smoke|asap|alone|sendiri/i.test(message) ? 'withdraw' : /ground|tanah|peat|gambut/i.test(message) ? 'peat_return' : 'report_30s')
  const withdraw = topic === 'withdraw'
  const upwind = topic === 'wind_upwind'
  const peat = topic === 'peat_return'
  const prompts = withdraw ? [
    copy('You cannot see the fire edge through the smoke. What do you do first?', 'Anda tidak bisa melihat tepi api melalui asap. Apa yang Anda lakukan dulu?'),
    copy('Do you need permission to leave an unsafe situation?', 'Apakah Anda perlu izin untuk meninggalkan situasi tidak aman?'),
    copy('Once you are safe and upwind, what comes next?', 'Setelah aman di sisi datang angin, apa selanjutnya?'),
  ] : upwind ? [
    copy('Which side should you approach from?', 'Dari sisi mana Anda mendekat?'),
    copy('The wind shifts and smoke comes toward you. What now?', 'Angin berubah dan asap menuju Anda. Apa sekarang?'),
    copy('Where should you report a change in conditions?', 'Di mana Anda melaporkan perubahan kondisi?'),
  ] : peat ? [
    copy('An old fire site is smoking again. What do you do?', 'Lokasi kebakaran lama berasap lagi. Apa yang Anda lakukan?'),
    copy('Can a peat fire continue underground?', 'Bisakah api gambut terus menyala di bawah tanah?'),
    copy('How should you check a smoking old site?', 'Bagaimana Anda memeriksa lokasi lama yang berasap?'),
  ] : [
    copy('What do you do first when you see a fire?', 'Apa yang Anda lakukan dulu saat melihat api?'),
    copy('What should your report describe?', 'Apa yang harus dijelaskan dalam laporan Anda?'),
    copy('Where should you make your report?', 'Dari mana Anda harus membuat laporan?'),
  ]
  const right = withdraw ? [
    copy('Move upwind, out of the smoke', 'Pindah ke sisi datang angin, keluar dari asap'),
    copy('No. Leave first and report after', 'Tidak. Pergi dulu lalu lapor'),
    copy('Report the change from safety', 'Laporkan perubahan dari tempat aman'),
  ] : upwind ? [copy('From upwind', 'Dari sisi datang angin'), copy('Move upwind, out of the smoke', 'Pindah ke sisi datang angin, keluar dari asap'), copy('From a safe place, using Report', 'Dari tempat aman, gunakan Lapor')]
    : peat ? [copy('Report it for a re-check', 'Laporkan untuk diperiksa ulang'), copy('Yes. Report signs of re-ignition', 'Ya. Laporkan tanda api menyala lagi'), copy('Stay at a safe distance and report', 'Tetap di jarak aman dan lapor')]
      : [copy('Report from a safe distance', 'Lapor dari jarak aman'), copy('What you see and where, from safety', 'Apa yang terlihat dan di mana, dari tempat aman'), copy('From a safe distance, out of smoke', 'Dari jarak aman, di luar asap')]
  const wrongOne = withdraw && index === 1 ? copy('Keep digging the fire line', 'Terus menggali sekat api') : copy('Go closer to the fire', 'Dekati api')
  const wrongThree = withdraw && index === 1 ? copy('Wait for Bu Maya to answer', 'Tunggu jawaban Bu Maya') : copy('Wait in the smoke', 'Tunggu di dalam asap')
  return {
    practice: true, ruleKey: withdraw ? 'withdraw' : upwind ? 'upwind' : 'report', correct: null, safetyLines: [],
    reply: withdraw ? copy('Leave now. Move upwind, out of the smoke, to clear air. Do not finish the job first.', 'Pergi sekarang. Pindah ke sisi datang angin, keluar dari asap ke udara bersih. Jangan selesaikan pekerjaan dulu.')
      : upwind ? copy('Stay upwind and out of the smoke. If the wind changes, move to clear air and report from safety.', 'Tetap di sisi datang angin dan di luar asap. Jika angin berubah, pindah ke udara bersih dan lapor dari tempat aman.')
        : peat ? copy('Peat can keep burning underground and re-ignite. Stay at a safe distance and report smoke at the old site.', 'Gambut dapat terus terbakar di bawah tanah dan menyala lagi. Tetap di jarak aman dan laporkan asap di lokasi lama.')
          : copy('Report from a safe distance. Say what you see and where you are. Stay out of the smoke.', 'Lapor dari jarak aman. Sebutkan apa yang terlihat dan lokasi Anda. Jauhi asap.'),
    check: { index, total: 3, lessonId, question: prompts[index - 1], options: [{ id: '1', label: wrongOne }, { id: '2', label: right[index - 1] }, { id: '3', label: wrongThree }] },
    correctId: '2', feedback: withdraw && index === 1 ? copy('Right. Smoke hides where the fire is going, so you leave first and report after.', 'Benar. Asap menutupi arah api, jadi pergi dulu lalu lapor.') : copy('Right. Keep yourself safe and report from clear air.', 'Benar. Jaga keselamatan dan lapor dari udara bersih.'),
  }
}
