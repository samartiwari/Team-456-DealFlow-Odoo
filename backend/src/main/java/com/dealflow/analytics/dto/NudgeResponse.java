package com.dealflow.analytics.dto;

/**
 * @param draft the follow-up text. There is no mail server, so it is returned rather than
 *              sent -- the screen shows it instead of claiming an email went out
 */
public record NudgeResponse(String draft, DealHealthBoardResponse board) {}
