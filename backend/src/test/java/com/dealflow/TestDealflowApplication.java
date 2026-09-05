package com.dealflow;

import org.springframework.boot.SpringApplication;

public class TestDealflowApplication {

	public static void main(String[] args) {
		SpringApplication.from(DealflowApplication::main).with(TestcontainersConfiguration.class).run(args);
	}

}
