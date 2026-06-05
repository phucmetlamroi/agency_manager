-- [Discord parity #9] Add VOICE to the ChannelType enum.
-- Additive, non-destructive — no existing rows reference this value.
ALTER TYPE "ChannelType" ADD VALUE 'VOICE';
