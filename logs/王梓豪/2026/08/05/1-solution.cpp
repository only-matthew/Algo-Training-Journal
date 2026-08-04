#include<iostream>
#include<vector>
#include<algorithm>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {int n;
        cin>>n;
        string s;
        cin>>s;
        bool flag=false;
        for(int i=1;i<s.length()-1;i++)
        {
            if(s[i-1]==s[i+1]&&s[i]!=s[i-1])
            {
                flag=true;
                break;
            }
        }
        int cnt=1;
        for(int i=0;i<s.length()-1;i++)
        {
            if(s[i]!=s[i+1])
            cnt++;
        }
        if(flag)
        cnt-=2;
        else
        {
            for(int i=1;i<s.size()-1;i++)
            {
                if(s[i]!=s[i+1]&&s[i]!=s[i-1])
                {
                    cnt--;
                    break;
                }
            }
        }
        cout<<cnt<<endl;
    }
}