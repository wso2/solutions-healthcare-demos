# WSO2 Care Loop: Product Overview

## The problem

Heart failure is one of the most common, deadly, and costly chronic conditions in the world, affecting an estimated 64 million people and rising as populations age (Global Public Health Burden of Heart Failure review). The form this platform targets, heart failure with reduced ejection fraction (HFrEF), is the sharp end of it: five-year mortality runs as high as 43 to 75% (Burger et al., European Journal of Heart Failure, 2023), and only about a quarter of patients survive five years after a hospitalisation for it (Heart Failure With Reduced Ejection Fraction: A Review, JAMA, 2020).

The cruel part for patients is that the deterioration that lands them in hospital builds silently for days, often weeks, before they feel anything. The signs they are usually told to watch, like their weight, change late and unreliably, so by the time a patient feels sick enough to call, a problem that could have been handled at home has often become an emergency admission. The result is a costly revolving door: close to one in five heart failure patients is readmitted within 30 days (Khan et al., Circulation: Heart Failure), and roughly a third within a year (Global Comparison of Readmission Rates, JACC, 2023).

For the providers managing these patients, mainly heart clinics and their front-desk staff and doctors, care is forced to be reactive. They cannot watch every patient every day, so they wait for deterioration to announce itself, usually in the emergency room.

## What the Care Loop does

The Care Loop is a remote monitoring platform that quietly keeps an eye on a patient at home through a device they wear, their everyday vitals, and short symptom check-ins, and continuously assesses whether they are trending toward a heart failure event.

When someone's risk starts to climb, the system reaches out with a quick, tailored symptom questionnaire, and if the concern holds up, it surfaces a clear, prioritised case to the clinic. The front desk routes it to a doctor for review or a telehealth consult, and a clinician always makes the final call. In practice, a heart clinic can run the Care Loop across its HFrEF patients and be alerted to the ones quietly heading for trouble, while leaving the stable majority undisturbed.

At a domain level, the platform watches over a patient in two ways at once:

- **Continuous vitals monitoring.** Everyday readings from a wearable device are checked frequently, so a deterioration trend can be picked up as it builds, not just when a patient happens to notice something is wrong.
- **Periodic symptom check-ins.** A short, conversational questionnaire goes out to the patient day to day, and an unscheduled, more urgent one goes out the moment vitals look concerning, so the platform can ask the right question at the right time instead of waiting for the next routine check-in.

The two streams feed a single, ongoing risk assessment. Most days, nothing happens, because most days a patient's vitals and symptoms simply confirm they are stable. The system is designed to stay out of the way until there is a genuine reason to raise a hand, and then to raise it clearly, with the evidence attached, so a clinic can act on a specific, well-supported concern rather than dig through raw noise. A human clinician always makes the final call; the platform's role is to prioritise attention, not to diagnose or treat on its own.

## The value

The value is the shift from reacting to a crisis to preventing one. By watching continuously, the platform can flag deterioration during the roughly two-week window before symptoms appear (SCALE-HF 1, Journal of Cardiac Failure, 2024), the window in which an early phone call, a medication adjustment, or a clinic visit can keep a patient out of hospital altogether. That means fewer emergency admissions, earlier and cheaper interventions, and clinicians spending their attention on the patients who genuinely need it, guided by evidence the system has already gathered and prioritised rather than raw noise.

The approach is not speculative: across randomised trials, remote monitoring for heart failure has been shown to lower mortality and reduce hospitalisations (De Lathauwer et al., European Journal of Heart Failure, 2025; TIM-HF2, The Lancet, 2018).

The Care Loop is also open source and built on open health-data standards. Because of this, it works with a clinic's existing records system instead of replacing it, and can be deployed across very different health systems and regions, including the lower-resource settings where the need is often greatest.

In short, the Care Loop gives heart failure patients back the days the current system throws away, and gives the clinics caring for them a way to act on those days before it is too late.

## Who it's for

The Care Loop is built for providers, not patients as end customers: heart clinics, and specifically the front-desk staff who triage incoming concerns and the doctors who review them. The patient's part of the experience (wearing a device, answering a check-in) is designed to be as low-effort as possible, since the clinic is the one acting on what the platform surfaces.

## How a case moves through the loop

Broadly, a flagged case follows the same path regardless of what triggered it:

1. The platform notices a patient's trend looks concerning, based on their vitals, their symptom responses, or both.
2. It gathers enough additional context (a targeted follow-up question, a look at recent history) to decide whether the concern holds up.
3. If it does, a clear, evidence-backed case is raised to the clinic.
4. Front-desk staff triage the case and assign it to a doctor.
5. The doctor reviews it and decides on next steps, whether that's a phone call, a medication adjustment, a clinic visit, or a telehealth session.

The point throughout is that the platform's job is to notice and prioritise; the clinician's job is to decide and act.
