#include<iostream>
#include<cstring>
using namespace std;
char s[260];
int main()
{
    int k;
    cin>>s>>k;
    int len=strlen(s);
    while(k--)
    {
        int p=len-1;
        for(int i=0;i<len-1;i++)
        {
            if(s[i]>s[i+1])
            {
                p=i;
                break;
            }
        }
        for(int i=p;i<len-1;i++)s[i]=s[i+1];
        len--;
    }
    int p=0;
    while(p<len&&s[p]=='0')p++;
    if(p==len)
    {
        cout<<0<<endl;
        return 0;
    }
    for(int i=p;i<len;i++)cout<<s[i];
    cout<<endl;
    return 0;
}