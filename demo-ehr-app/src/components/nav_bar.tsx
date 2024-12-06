import { Button } from "@mui/material";
import { SCREEN_HEIGHT } from "../constants/page";
import { Box, Flex } from "@chakra-ui/react";
import { SECONDARY_COLOR } from "../constants/color";

export default function NavBar() {
  return (
      <Box bg={SECONDARY_COLOR} height={100} marginBottom={SCREEN_HEIGHT*0.04}>
        <Flex alignItems={"center"} justifyContent={"space-between"}>
          <Button href="/dashboard">
            <Box borderRadius="50%" overflow="hidden">
              <img src="/demo_logo.png" alt="Demo Logo" height={80} width={80} />
            </Box>
          </Button>
          <Button href="/dashboard/profile">
            <Box borderRadius="50%" overflow="hidden">
              <img src="/profile.png" alt="Demo Logo" height={80} width={80} />
            </Box>
          </Button>
        </Flex>
      </Box>
  );
}
