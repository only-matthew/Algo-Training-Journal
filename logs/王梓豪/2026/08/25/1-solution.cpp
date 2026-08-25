#include <bits/stdc++.h>
using namespace std;
string st[16]={"0000","0001","0010","0011","0100","0101","0110",
               "0111","1000","1001","1010","1011","1100",
                "1101","1110","1111"};
void solve(string s)
{
    string ans;
    for(char ch:s)
    {if(ch>='0'&&ch<='9')
        ans+=st[ch-'0'];
     else
        ans+=st[ch-'A'+10];
    }
    int first=0;
    while(ans[first]=='0')first++;
    cout<<ans.substr(first);
}
int main()
{
    int n;
    cin>>n;
    string s;
    cin>>s;
    solve(s);
}